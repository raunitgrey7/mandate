import { getDb, schema } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal/webhooks";
import { appendLedger } from "@/lib/ledger";
import { json } from "@/lib/http";

type PayPalEvent = { id: string; event_type: string; summary?: string; resource?: Record<string, unknown> };

/**
 * PayPal -> Mandate. Captures, refunds, payouts and disputes arrive here and
 * are pinned to the ledger, so the audit trail contains PayPal's own view of
 * each money movement next to the agent's intent and the policy decision.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: PayPalEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, { status: 400 });
  }
  const verified = await verifyWebhook(req.headers, raw).catch(() => false);
  const resource = event.resource ?? {};
  const resourceId = String(resource.id ?? "");
  const customId = String(resource.custom_id ?? (resource as { purchase_units?: { custom_id?: string }[] }).purchase_units?.[0]?.custom_id ?? "");
  const db = await getDb();
  await db
    .insert(schema.webhookEvents)
    .values({ id: event.id, eventType: event.event_type, resourceId, summary: event.summary ?? "", verified, raw: event as unknown as Record<string, unknown> })
    .onConflictDoNothing();
  await appendLedger({
    intentId: customId.startsWith("int_") ? customId : null,
    type: `webhook.${event.event_type}`,
    payload: { eventId: event.id, resourceId, verified, summary: event.summary ?? "" },
  });
  return json({ received: true, verified });
}
