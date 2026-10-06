import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/ids";
import { appendLedger } from "@/lib/ledger";
import { evaluate } from "@/lib/policy/engine";
import { reviewIntent } from "@/lib/policy/review";
import { chargeVaultedWallet, refundCapture } from "@/lib/paypal/orders";
import { sendPayout } from "@/lib/paypal/payouts";
import { getActiveMandate, getIntent, getWallet, listAgents, spendUsage, updateIntent } from "@/lib/store";
import type { Agent, Decision, Intent, IntentItem } from "@/lib/db/schema";

export type NewIntent = {
  kind: "purchase" | "payout";
  merchant: string;
  recipientEmail?: string | null;
  items?: IntentItem[];
  amountCents: number;
  currency?: string;
  category?: string;
  recurring?: boolean;
  reason: string;
};

/**
 * The whole lifecycle of an agent's request:
 *   1. persist the intent (status: evaluating)
 *   2. semantic review (LLM) -> normalised category, risk, escalation
 *   3. deterministic policy evaluation on the *reviewed* category
 *   4. auto_approved -> move money via PayPal; needs_human -> inbox; denied -> stop
 * Every step is appended to the hash-chained ledger.
 */
export async function submitIntent(agent: Agent, input: NewIntent): Promise<Intent> {
  const db = await getDb();
  const wallet = await getWallet();
  const mandate = await getActiveMandate();
  if (!mandate) throw new Error("No active mandate");
  const items = (input.items ?? []).map((i) => ({ name: String(i.name).slice(0, 120), quantity: Math.max(1, Math.round(i.quantity || 1)), unitCents: Math.max(0, Math.round(i.unitCents || 0)) }));
  const [intent] = await db
    .insert(schema.intents)
    .values({
      id: newId("int"),
      walletId: wallet.id,
      agentId: agent.id,
      mandateId: mandate.id,
      kind: input.kind,
      merchant: input.merchant.trim().slice(0, 120),
      recipientEmail: input.recipientEmail ?? null,
      items,
      amountCents: Math.round(input.amountCents),
      currency: input.currency ?? "USD",
      category: (input.category ?? "other").toLowerCase(),
      recurring: Boolean(input.recurring),
      reason: input.reason.slice(0, 1000),
      status: "evaluating",
    })
    .returning();
  await appendLedger({
    intentId: intent.id,
    agentId: agent.id,
    type: "intent.submitted",
    payload: { agent: agent.name, kind: intent.kind, merchant: intent.merchant, amountCents: intent.amountCents, category: intent.category, reason: intent.reason, items },
  });

  // Semantic review first so the rules run on what is really being bought.
  let reviewed: Awaited<ReturnType<typeof reviewIntent>>;
  try {
    reviewed = await reviewIntent(mandate.policy, mandate.sourceText, {
    agentName: agent.name,
    agentRole: agent.role,
    kind: intent.kind,
    merchant: intent.merchant,
    recipientEmail: intent.recipientEmail,
    items,
    amountCents: intent.amountCents,
    category: intent.category,
    recurring: intent.recurring,
    reason: intent.reason,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const failed = await updateIntent(intent.id, { status: "failed", error: `Review unavailable: ${message}` });
    await appendLedger({ intentId: intent.id, agentId: agent.id, type: "review.error", payload: { message } });
    return failed;
  }
  const { review, reviewer } = reviewed;
  const agents = await listAgents();
  const usage = await spendUsage(agents);
  const engine = evaluate(mandate.policy, usage, {
    kind: intent.kind,
    agentName: agent.name,
    merchant: intent.merchant,
    recipientEmail: intent.recipientEmail,
    amountCents: intent.amountCents,
    category: review.category !== intent.category && intent.kind === "purchase" ? review.category : intent.category,
    recurring: intent.recurring,
  });
  const rules = [...engine.rules];
  if (review.category !== intent.category && intent.kind === "purchase") {
    rules.unshift({ rule: "review.category", outcome: "pass", detail: `Agent said "${intent.category}", reviewer reclassified as "${review.category}".` });
  }
  let verdict = engine.verdict;
  if (verdict === "auto_approved" && (review.escalate || review.risk >= 60)) {
    verdict = "needs_human";
    rules.push({ rule: "review.escalate", outcome: "escalate", detail: review.rationale });
  } else if (verdict === "auto_approved") {
    rules.push({ rule: "review", outcome: "pass", detail: review.rationale });
  }
  const decision: Decision = {
    verdict,
    rules,
    review,
    reviewer,
    summary: summarise(verdict, rules, review),
  };
  let updated = await updateIntent(intent.id, {
    status: verdict,
    decision,
    risk: review.risk,
    category: review.category !== intent.category && intent.kind === "purchase" ? review.category : intent.category,
    decidedAt: new Date(),
    decidedBy: verdict === "needs_human" ? null : "policy",
  });
  await appendLedger({ intentId: intent.id, agentId: agent.id, type: `decision.${verdict}`, payload: { verdict, risk: review.risk, reviewer, rules: rules.filter((r) => r.outcome !== "pass").map((r) => `${r.rule}: ${r.detail}`), summary: decision.summary } });

  if (verdict === "auto_approved") updated = await execute(updated, agent, "policy");
  return updated;
}

function summarise(verdict: Decision["verdict"], rules: Decision["rules"], review: Decision["review"]) {
  if (verdict === "denied") return rules.filter((r) => r.outcome === "deny").map((r) => r.detail).join(" ");
  if (verdict === "needs_human") return rules.filter((r) => r.outcome === "escalate").map((r) => r.detail).join(" ");
  return review?.rationale ?? "Within mandate.";
}

/** Owner decision from the approvals inbox. */
export async function decideIntent(id: string, approve: boolean, by = "owner", note = ""): Promise<Intent> {
  const intent = await getIntent(id);
  if (!intent) throw new Error("Intent not found");
  if (intent.status !== "needs_human") throw new Error(`Intent is ${intent.status}, not awaiting approval`);
  const agents = await listAgents();
  const agent = agents.find((a) => a.id === intent.agentId)!;
  if (!approve) {
    const updated = await updateIntent(id, { status: "denied", decidedBy: by, decidedAt: new Date(), error: note || null });
    await appendLedger({ intentId: id, agentId: agent.id, type: "owner.denied", payload: { by, note } });
    return updated;
  }
  const approved = await updateIntent(id, { status: "approved", decidedBy: by, decidedAt: new Date() });
  await appendLedger({ intentId: id, agentId: agent.id, type: "owner.approved", payload: { by, note } });
  return execute(approved, agent, by);
}

/** Moves the money through PayPal for an approved intent. */
async function execute(intent: Intent, agent: Agent, by: string): Promise<Intent> {
  const wallet = await getWallet();
  try {
    if (intent.kind === "payout") {
      const batch = await sendPayout({
        intentId: intent.id,
        recipientEmail: intent.recipientEmail ?? "",
        amountCents: intent.amountCents,
        currency: intent.currency,
        note: `${agent.name} (Mandate): ${intent.reason}`,
        agentName: agent.name,
      });
      const updated = await updateIntent(intent.id, { status: "paid", paidAt: new Date(), paypalPayoutBatchId: batch.batch_header.payout_batch_id });
      await appendLedger({ intentId: intent.id, agentId: agent.id, type: "paypal.payout.sent", payload: { payoutBatchId: batch.batch_header.payout_batch_id, batchStatus: batch.batch_header.batch_status, recipient: intent.recipientEmail, amountCents: intent.amountCents, approvedBy: by } });
      return updated;
    }
    if (!wallet.paymentTokenId) throw new Error("Wallet is not linked to PayPal yet. Link it on the Wallet page.");
    const { order, capture } = await chargeVaultedWallet({
      intentId: intent.id,
      vaultId: wallet.paymentTokenId,
      sourceType: wallet.sourceType,
      amountCents: intent.amountCents,
      currency: intent.currency,
      merchant: intent.merchant,
      description: intent.reason || intent.items.map((i) => i.name).join(", "),
      items: intent.items,
    });
    const ok = capture?.status === "COMPLETED" || order.status === "COMPLETED";
    const updated = await updateIntent(intent.id, {
      status: ok ? "paid" : "failed",
      paidAt: ok ? new Date() : null,
      paypalOrderId: order.id,
      paypalCaptureId: capture?.id ?? null,
      error: ok ? null : `Order status ${order.status}`,
    });
    await appendLedger({ intentId: intent.id, agentId: agent.id, type: ok ? "paypal.capture.completed" : "paypal.capture.failed", payload: { orderId: order.id, captureId: capture?.id, captureStatus: capture?.status, amountCents: intent.amountCents, approvedBy: by } });
    return updated;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const updated = await updateIntent(intent.id, { status: "failed", error: message });
    await appendLedger({ intentId: intent.id, agentId: agent.id, type: "paypal.error", payload: { message } });
    return updated;
  }
}

export async function refundIntent(id: string, note: string): Promise<Intent> {
  const intent = await getIntent(id);
  if (!intent?.paypalCaptureId) throw new Error("Nothing to refund");
  const r = await refundCapture(intent.paypalCaptureId, intent.id, note);
  const updated = await updateIntent(id, { status: "refunded", paypalRefundId: r.id });
  await appendLedger({ intentId: id, agentId: intent.agentId, type: "paypal.refund", payload: { refundId: r.id, status: r.status, note } });
  return updated;
}
