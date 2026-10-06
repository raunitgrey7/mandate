import type { Policy } from "./schema";
import type { RuleResult } from "@/lib/db/schema";

export type SpendUsage = {
  /** Cents already paid (or committed) in the window, across all agents. */
  day: number;
  week: number;
  month: number;
  /** Cents by agent name (lowercase) this month. */
  agentMonth: Record<string, number>;
  payoutMonth: number;
  /** Lowercased merchants that have at least one paid intent. */
  knownMerchants: string[];
};

export type EngineInput = {
  kind: "purchase" | "payout";
  agentName: string;
  merchant: string;
  recipientEmail?: string | null;
  amountCents: number;
  category: string;
  recurring: boolean;
  now?: Date;
};

export type EngineOutput = {
  verdict: "auto_approved" | "needs_human" | "denied";
  rules: RuleResult[];
};

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const toCents = (d: number | null) => (d === null ? null : Math.round(d * 100));
const norm = (s: string) => s.trim().toLowerCase();
const matches = (needle: string, list: string[]) => {
  const n = norm(needle);
  return list.some((x) => {
    const y = norm(x);
    return n === y || n.includes(y) || y.includes(n);
  });
};

/**
 * Deterministic policy evaluation. The LLM may *escalate* (raise an intent to
 * the owner) but it never relaxes anything decided here: hard limits and block
 * lists are enforced by code, not by a model.
 */
export function evaluate(policy: Policy, usage: SpendUsage, input: EngineInput): EngineOutput {
  const rules: RuleResult[] = [];
  let deny = false;
  let escalate = false;
  const push = (rule: string, outcome: RuleResult["outcome"], detail: string) => {
    rules.push({ rule, outcome, detail });
    if (outcome === "deny") deny = true;
    if (outcome === "escalate") escalate = true;
  };
  const agentPolicy = policy.agents.find((a) => norm(a.name) === norm(input.agentName));

  if (input.kind === "payout") {
    if (!policy.payouts.enabled) push("payouts.enabled", "deny", "Payouts are not permitted by this mandate.");
    const cap = toCents(policy.payouts.perPayout);
    if (cap !== null && input.amountCents > cap) {
      push("payouts.perPayout", "deny", `${dollars(input.amountCents)} exceeds the ${dollars(cap)} per-payout cap.`);
    } else if (cap !== null) push("payouts.perPayout", "pass", `${dollars(input.amountCents)} is within the ${dollars(cap)} cap.`);
    const monthly = toCents(policy.payouts.monthly);
    if (monthly !== null) {
      const after = usage.payoutMonth + input.amountCents;
      if (after > monthly) push("payouts.monthly", "escalate", `Would bring payouts this month to ${dollars(after)}, over the ${dollars(monthly)} budget.`);
      else push("payouts.monthly", "pass", `${dollars(after)} of ${dollars(monthly)} monthly payout budget after this.`);
    }
    if (policy.payouts.recipients.length > 0) {
      const target = `${input.merchant} ${input.recipientEmail ?? ""}`;
      if (!matches(target, policy.payouts.recipients)) push("payouts.recipients", "deny", `${input.merchant || input.recipientEmail} is not an approved payout recipient.`);
      else push("payouts.recipients", "pass", `${input.merchant || input.recipientEmail} is an approved recipient.`);
    }
    return { verdict: deny ? "denied" : escalate ? "needs_human" : "auto_approved", rules };
  }

  // Category block / allow lists
  if (matches(input.category, policy.categories.blocked)) {
    push("categories.blocked", "deny", `Category "${input.category}" is blocked by the mandate.`);
  } else if (policy.categories.allowed.length > 0 && !matches(input.category, policy.categories.allowed)) {
    push("categories.allowed", "deny", `Category "${input.category}" is not in the allowed list.`);
  } else push("categories", "pass", `Category "${input.category}" is permitted.`);

  // Merchant lists
  if (matches(input.merchant, policy.merchants.blocked)) {
    push("merchants.blocked", "deny", `Merchant "${input.merchant}" is blocked.`);
  } else if (policy.merchants.allowed.length > 0 && !matches(input.merchant, policy.merchants.allowed)) {
    push("merchants.allowed", "deny", `Merchant "${input.merchant}" is not on the approved merchant list.`);
  } else push("merchants", "pass", `Merchant "${input.merchant}" is permitted.`);

  // Agent-specific category scope
  if (agentPolicy && agentPolicy.categories.length > 0) {
    if (!matches(input.category, agentPolicy.categories)) {
      push("agents.categories", "deny", `${input.agentName} may only buy ${agentPolicy.categories.join(", ")}; "${input.category}" is out of scope.`);
    } else push("agents.categories", "pass", `${input.agentName} is scoped to ${agentPolicy.categories.join(", ")}.`);
  }

  // Hard per-transaction caps
  const perTx = toCents(policy.limits.perTransaction);
  if (perTx !== null && input.amountCents > perTx) {
    push("limits.perTransaction", "deny", `${dollars(input.amountCents)} exceeds the ${dollars(perTx)} single-purchase cap.`);
  } else if (perTx !== null) push("limits.perTransaction", "pass", `${dollars(input.amountCents)} is under the ${dollars(perTx)} single-purchase cap.`);
  const agentPerTx = toCents(agentPolicy?.perTransaction ?? null);
  if (agentPerTx !== null && input.amountCents > agentPerTx) {
    push("agents.perTransaction", "deny", `${dollars(input.amountCents)} exceeds ${input.agentName}'s ${dollars(agentPerTx)} per-purchase cap.`);
  } else if (agentPerTx !== null) push("agents.perTransaction", "pass", `Within ${input.agentName}'s ${dollars(agentPerTx)} per-purchase cap.`);

  // Approval threshold
  const threshold = toCents(policy.approvalAbove);
  if (threshold !== null && input.amountCents > threshold) {
    push("approvalAbove", "escalate", `${dollars(input.amountCents)} is above the ${dollars(threshold)} auto-approve threshold.`);
  } else if (threshold !== null) push("approvalAbove", "pass", `${dollars(input.amountCents)} is under the ${dollars(threshold)} auto-approve threshold.`);

  // Rolling budgets
  const windows: [string, number | null, number][] = [
    ["limits.daily", toCents(policy.limits.daily), usage.day],
    ["limits.weekly", toCents(policy.limits.weekly), usage.week],
    ["limits.monthly", toCents(policy.limits.monthly), usage.month],
  ];
  for (const [rule, cap, used] of windows) {
    if (cap === null) continue;
    const after = used + input.amountCents;
    if (after > cap) push(rule, "escalate", `Would bring ${rule.split(".")[1]} spend to ${dollars(after)}, over the ${dollars(cap)} budget.`);
    else push(rule, "pass", `${dollars(after)} of ${dollars(cap)} ${rule.split(".")[1]} budget after this.`);
  }
  const agentMonthly = toCents(agentPolicy?.monthly ?? null);
  if (agentMonthly !== null) {
    const after = (usage.agentMonth[norm(input.agentName)] ?? 0) + input.amountCents;
    if (after > agentMonthly) push("agents.monthly", "escalate", `${input.agentName} would reach ${dollars(after)} this month, over its ${dollars(agentMonthly)} budget.`);
    else push("agents.monthly", "pass", `${input.agentName} at ${dollars(after)} of ${dollars(agentMonthly)} this month.`);
  }

  // Subscriptions
  if (input.recurring) {
    if (!policy.subscriptions.allowed) push("subscriptions.allowed", "deny", "Subscriptions are not permitted by this mandate.");
    const maxMonthly = toCents(policy.subscriptions.maxMonthly);
    if (maxMonthly !== null && input.amountCents > maxMonthly) {
      push("subscriptions.maxMonthly", "escalate", `${dollars(input.amountCents)}/month is above the ${dollars(maxMonthly)} subscription limit.`);
    } else if (maxMonthly !== null) push("subscriptions.maxMonthly", "pass", `Under the ${dollars(maxMonthly)}/month subscription limit.`);
  }

  // Hours window
  if (policy.hours) {
    const now = input.now ?? new Date();
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: policy.hours.timezone || "UTC" });
    const hm = fmt.format(now);
    const inWindow = policy.hours.start <= policy.hours.end
      ? hm >= policy.hours.start && hm <= policy.hours.end
      : hm >= policy.hours.start || hm <= policy.hours.end;
    if (!inWindow) push("hours", "escalate", `It is ${hm} ${policy.hours.timezone}; purchases are only automatic between ${policy.hours.start} and ${policy.hours.end}.`);
    else push("hours", "pass", `Inside the ${policy.hours.start}-${policy.hours.end} window.`);
  }

  // New merchant
  const isNew = input.merchant && !usage.knownMerchants.includes(norm(input.merchant));
  const asksNewMerchant = policy.alwaysAsk.some((s) => /new merchant|not used before|first purchase/i.test(s));
  if (isNew && asksNewMerchant) push("alwaysAsk.newMerchant", "escalate", `First purchase from "${input.merchant}"; the mandate asks for approval on new merchants.`);
  else if (isNew) push("merchant.new", "pass", `First purchase from "${input.merchant}" (no new-merchant rule).`);
  else push("merchant.known", "pass", `"${input.merchant}" has been paid before.`);

  return { verdict: deny ? "denied" : escalate ? "needs_human" : "auto_approved", rules };
}
