import { generateText, Output } from "ai";
import { PolicySchema, DEFAULT_POLICY, type Policy, CATEGORIES } from "./schema";
import { getModel, aiConfigured } from "@/lib/ai/model";

const SYSTEM = `You compile plain-English spending mandates written by a person into a strict JSON policy that governs what their AI agents may pay for through PayPal.

Rules:
- Be literal and conservative. If a sentence is ambiguous, choose the stricter reading and say so in "rationale".
- Amounts are US dollars as numbers. null means "no limit was stated".
- "needs my approval", "ask me", "check with me" map to approvalAbove (for amounts) or alwaysAsk (for situations).
- "never", "no", "do not" map to blocked lists.
- Per-agent sentences ("the travel agent can...") go under agents[] using the agent's name (Pantry, Travel, Ops, or whatever the text calls it).
- Payments to people ("pay the dog walker", "tip", "reimburse") are payouts, not purchases.
- Only use categories from this list: ${CATEGORIES.join(", ")}.
- "rationale" must contain exactly one short line per sentence of the mandate explaining the mapping.
- Never invent limits that were not written.`;

export type CompileResult = { policy: Policy; compiledBy: "llm" | "heuristic"; model?: string };

/** Compiles mandate prose into a Policy using the configured LLM, with a rule-based fallback. */
export async function compileMandate(text: string): Promise<CompileResult> {
  if (!aiConfigured()) return { policy: heuristicCompile(text), compiledBy: "heuristic" };
  const model = await getModel();
  const result = await generateText({
    model,
    output: Output.object({ schema: PolicySchema }),
    system: SYSTEM,
    prompt: `Mandate:\n"""\n${text}\n"""\nReturn the policy JSON.`,
    temperature: 0,
  });
  const parsed = PolicySchema.safeParse(result.output);
  if (!parsed.success) throw new Error(`Compiler returned an invalid policy: ${parsed.error.message}`);
  return { policy: parsed.data, compiledBy: "llm", model: typeof model === "string" ? model : model.modelId };
}

/**
 * Regex-based fallback so the product still works (with reduced nuance) when no
 * model key is present. It covers the common sentence shapes and records what
 * it could not understand in rationale.
 */
export function heuristicCompile(text: string): Policy {
  const p: Policy = JSON.parse(JSON.stringify({ ...DEFAULT_POLICY, agents: [], payouts: { ...DEFAULT_POLICY.payouts, recipients: [] }, categories: { allowed: [], blocked: [] }, alwaysAsk: [], rationale: [], limits: { perTransaction: null, daily: null, weekly: null, monthly: null }, approvalAbove: null, subscriptions: { allowed: true, maxMonthly: null } }));
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const money = (s: string) => {
    const m = s.match(/\$\s?(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };
  for (const s of sentences) {
    const l = s.toLowerCase();
    const amt = money(s);
    let note = "No rule recognised; ignored.";
    if (/never|do not|don't|no .*(alcohol|tobacco|gambling)/.test(l)) {
      const found = CATEGORIES.filter((c) => l.includes(c));
      if (found.length) {
        p.categories.blocked.push(...found);
        note = `Blocked categories: ${found.join(", ")}.`;
      }
    } else if (/approval|ask me|check with me/.test(l) && amt !== null && /over|above|more than|exceed/.test(l)) {
      p.approvalAbove = amt;
      note = `approvalAbove = ${amt}.`;
    } else if (/ask me|approval/.test(l)) {
      p.alwaysAsk.push(s);
      note = "Added to alwaysAsk.";
    } else if (/per month|a month|monthly/.test(l) && amt !== null && /total|in total|overall|budget/.test(l)) {
      p.limits.monthly = amt;
      note = `limits.monthly = ${amt}.`;
    } else if (/per week|a week|weekly/.test(l) && amt !== null) {
      p.limits.weekly = amt;
      note = `limits.weekly = ${amt}.`;
    } else if (/subscription/.test(l)) {
      p.subscriptions.allowed = !/not allowed|never|no subscriptions/.test(l);
      if (amt !== null) p.subscriptions.maxMonthly = amt;
      note = `subscriptions.allowed = ${p.subscriptions.allowed}${amt !== null ? `, maxMonthly = ${amt}` : ""}.`;
    } else if (/pay(out)?s? (the|a|to)/.test(l) || /tip|reimburse/.test(l)) {
      p.payouts.enabled = true;
      if (amt !== null) p.payouts.perPayout = amt;
      const who = s.match(/\(([^)]+)\)/);
      if (who) p.payouts.recipients.push(who[1]);
      const m = l.match(/max \$?(\d+)/);
      if (m) p.payouts.monthly = Number(m[1]);
      note = `payouts enabled${amt !== null ? `, perPayout = ${amt}` : ""}.`;
    } else if (/agent/.test(l) && amt !== null) {
      const name = (s.match(/the (\w+) agent/i)?.[1] ?? "agent").replace(/^\w/, (c) => c.toUpperCase());
      const cats = CATEGORIES.filter((c) => l.includes(c));
      p.agents.push({ name, monthly: null, perTransaction: amt, categories: cats });
      note = `agents[${name}].perTransaction = ${amt}.`;
    } else if (amt !== null && /single|each|per purchase|one purchase/.test(l)) {
      p.limits.perTransaction = amt;
      note = `limits.perTransaction = ${amt}.`;
    }
    p.rationale.push(`${s} -> ${note}`);
  }
  return PolicySchema.parse(p);
}
