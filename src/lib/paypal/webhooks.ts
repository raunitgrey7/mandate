import { paypal } from "./client";
import { env } from "@/lib/env";

export const WEBHOOK_EVENTS = [
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.DENIED",
  "VAULT.PAYMENT-TOKEN.CREATED",
  "VAULT.PAYMENT-TOKEN.DELETED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "CUSTOMER.DISPUTE.CREATED",
  "CUSTOMER.DISPUTE.RESOLVED",
];

/** Verifies a webhook POST using PayPal's verification endpoint. */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  if (!env.paypal.webhookId) return false;
  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return false;
  }
  const res = await paypal<{ verification_status: string }>({
    method: "POST",
    path: "/v1/notifications/verify-webhook-signature",
    body: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: env.paypal.webhookId,
      webhook_event: event,
    },
  });
  return res.verification_status === "SUCCESS";
}

/** Registers (or finds) the webhook for this deployment. Used by scripts/register-webhook. */
export async function ensureWebhook(url: string) {
  const list = await paypal<{ webhooks: { id: string; url: string }[] }>({ method: "GET", path: "/v1/notifications/webhooks" });
  const existing = list.webhooks.find((w) => w.url === url);
  if (existing) return existing;
  return paypal<{ id: string; url: string }>({
    method: "POST",
    path: "/v1/notifications/webhooks",
    body: { url, event_types: WEBHOOK_EVENTS.map((name) => ({ name })) },
  });
}
