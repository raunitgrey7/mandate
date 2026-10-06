import { z } from "zod";
import { submitIntent } from "@/lib/intents";
import { getActiveMandate, getIntent, getWallet, listAgents, listIntents, spendUsage } from "@/lib/store";
import { fmtMoney } from "@/lib/ids";
import type { Agent, Intent } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/policy/schema";

/**
 * The tool surface every agent sees, whether it connects over MCP, REST or
 * runs inside the playground. Keeping one definition means the MCP server, the
 * REST docs and the in-app agents cannot drift apart.
 */
export const PurchaseInput = z.object({
  merchant: z.string().min(1).describe("Store or service being paid, e.g. 'Fresh Market'."),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number().int().min(1).default(1), unit_price: z.number().min(0).describe("USD per unit") }))
    .min(1)
    .describe("What is being bought."),
  category: z.enum(CATEGORIES).describe("Your honest classification. The reviewer will check it."),
  reason: z.string().min(3).describe("Why you are buying this, in one sentence the owner will read."),
  recurring: z.boolean().default(false).describe("true for subscriptions or anything that will bill again."),
});

export const PayoutInput = z.object({
  recipient_email: z.string().email().describe("PayPal email of the person being paid."),
  recipient_name: z.string().min(1).describe("Who they are, e.g. 'Priya (dog walker)'."),
  amount: z.number().positive().describe("USD"),
  reason: z.string().min(3).describe("What the payment is for."),
});

export function presentIntent(i: Intent) {
  return {
    id: i.id,
    status: i.status,
    kind: i.kind,
    merchant: i.merchant,
    amount: fmtMoney(i.amountCents, i.currency),
    category: i.category,
    risk: i.risk,
    decision: i.decision?.summary ?? null,
    rules: i.decision?.rules.filter((r) => r.outcome !== "pass").map((r) => r.detail) ?? [],
    paypal: {
      order_id: i.paypalOrderId,
      capture_id: i.paypalCaptureId,
      payout_batch_id: i.paypalPayoutBatchId,
      refund_id: i.paypalRefundId,
    },
    error: i.error,
    created_at: i.createdAt,
    paid_at: i.paidAt,
    next_step:
      i.status === "needs_human"
        ? "Waiting for the owner's one-tap approval. Poll get_request_status; do not resubmit."
        : i.status === "denied"
          ? "Denied by the mandate. Do not retry with the same request; tell the user why."
          : i.status === "paid"
            ? "Payment complete. Keep the PayPal ids for the receipt."
            : null,
  };
}

export async function toolGetMandate(agent: Agent) {
  const mandate = await getActiveMandate();
  const wallet = await getWallet();
  const agents = await listAgents();
  const usage = await spendUsage(agents);
  const p = mandate?.policy;
  const me = p?.agents.find((a) => a.name.toLowerCase() === agent.name.toLowerCase());
  return {
    agent: { name: agent.name, role: agent.role },
    wallet_linked: wallet.status === "linked",
    mandate_text: mandate?.sourceText,
    your_limits: {
      per_transaction: me?.perTransaction ?? p?.limits.perTransaction ?? null,
      categories: me?.categories?.length ? me.categories : p?.categories.allowed.length ? p.categories.allowed : "any except blocked",
      blocked_categories: p?.categories.blocked ?? [],
      auto_approve_up_to: p?.approvalAbove ?? null,
      monthly_budget_remaining: p?.limits.monthly != null ? Math.max(0, p.limits.monthly - usage.month / 100) : null,
      payouts: p?.payouts,
    },
    advice: "Stay inside these numbers and label categories honestly. Anything above auto_approve_up_to, or from a new merchant, will wait for the owner.",
  };
}

export async function toolRequestPurchase(agent: Agent, input: z.infer<typeof PurchaseInput>) {
  const items = input.items.map((i) => ({ name: i.name, quantity: i.quantity, unitCents: Math.round(i.unit_price * 100) }));
  const amountCents = items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  const intent = await submitIntent(agent, { kind: "purchase", merchant: input.merchant, items, amountCents, category: input.category, recurring: input.recurring, reason: input.reason });
  return presentIntent(intent);
}

export async function toolRequestPayout(agent: Agent, input: z.infer<typeof PayoutInput>) {
  const intent = await submitIntent(agent, {
    kind: "payout",
    merchant: input.recipient_name,
    recipientEmail: input.recipient_email,
    amountCents: Math.round(input.amount * 100),
    category: "services",
    reason: input.reason,
  });
  return presentIntent(intent);
}

export async function toolGetStatus(agent: Agent, id: string) {
  const intent = await getIntent(id);
  if (!intent || intent.agentId !== agent.id) throw new Error("Request not found for this agent");
  return presentIntent(intent);
}

export async function toolListRequests(agent: Agent, limit = 20) {
  const all = await listIntents(200);
  return all.filter((i) => i.agentId === agent.id).slice(0, limit).map(presentIntent);
}
