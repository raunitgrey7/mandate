import { paypal, toMoney } from "./client";
import type { IntentItem } from "@/lib/db/schema";

export type Capture = { id: string; status: string; amount?: { value: string; currency_code: string } };
export type Order = {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: Capture[] } }[];
  payer?: { email_address?: string };
};

/**
 * Agent-initiated purchase: create an order against the owner's vaulted
 * funding source (payment_source.paypal.vault_id or payment_source.card.vault_id)
 * and capture it with no buyer present.
 */
export async function chargeVaultedWallet(args: {
  intentId: string;
  vaultId: string;
  sourceType: "paypal" | "card";
  amountCents: number;
  currency: string;
  merchant: string;
  description: string;
  items: IntentItem[];
}): Promise<{ order: Order; capture: Capture | null }> {
  const itemTotal = args.items.reduce((s, i) => s + i.unitCents * i.quantity, 0);
  const useItems = args.items.length > 0 && itemTotal === args.amountCents;
  const order = await paypal<Order>({
    method: "POST",
    path: "/v2/checkout/orders",
    requestId: `order-${args.intentId}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: args.intentId,
          custom_id: args.intentId,
          invoice_id: `MANDATE-${args.intentId}`,
          description: `${args.merchant}: ${args.description}`.slice(0, 127),
          soft_descriptor: "MANDATE AGENT",
          amount: {
            currency_code: args.currency,
            value: toMoney(args.amountCents),
            ...(useItems
              ? { breakdown: { item_total: { currency_code: args.currency, value: toMoney(itemTotal) } } }
              : {}),
          },
          ...(useItems
            ? {
                items: args.items.map((i) => ({
                  name: i.name.slice(0, 127),
                  quantity: String(i.quantity),
                  unit_amount: { currency_code: args.currency, value: toMoney(i.unitCents) },
                })),
              }
            : {}),
        },
      ],
      payment_source:
        args.sourceType === "card"
          ? { card: { vault_id: args.vaultId } }
          : { paypal: { vault_id: args.vaultId, experience_context: { brand_name: "Mandate", user_action: "PAY_NOW" } } },
    },
  });

  let final = order;
  if (order.status !== "COMPLETED") {
    final = await paypal<Order>({
      method: "POST",
      path: `/v2/checkout/orders/${order.id}/capture`,
      requestId: `capture-${args.intentId}`,
    });
  }
  const capture = final.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
  return { order: final, capture };
}

export async function getOrder(id: string) {
  return paypal<Order>({ method: "GET", path: `/v2/checkout/orders/${id}` });
}

export async function refundCapture(captureId: string, intentId: string, note: string) {
  return paypal<{ id: string; status: string }>({
    method: "POST",
    path: `/v2/payments/captures/${captureId}/refund`,
    requestId: `refund-${intentId}-${Date.now()}`,
    body: { note_to_payer: note.slice(0, 255) },
  });
}
