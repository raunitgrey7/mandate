import { paypal } from "./client";
import { env } from "@/lib/env";

type Link = { rel: string; href: string; method?: string };

export type SetupToken = { id: string; status: string; links: Link[]; customer?: { id: string } };
export type PaymentToken = {
  id: string;
  customer?: { id: string };
  payment_source?: {
    paypal?: { email_address?: string; name?: { given_name?: string; surname?: string }; usage_type?: string };
    card?: { brand?: string; last_digits?: string; name?: string; expiry?: string };
  };
};

/**
 * Step 1 of linking a wallet: create a setup token the owner approves once in
 * PayPal. usage_type MERCHANT + usage_pattern IMMEDIATE lets the merchant
 * (Mandate) charge later with the buyer absent, which is exactly what an
 * agent-initiated payment is.
 */
export async function createSetupToken(walletId: string) {
  const base = env.app.url;
  return paypal<SetupToken>({
    method: "POST",
    path: "/v3/vault/setup-tokens",
    requestId: `setup-${walletId}-${Date.now()}`,
    body: {
      customer: { id: walletId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22) },
      payment_source: {
        paypal: {
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          usage_pattern: "IMMEDIATE",
          permit_multiple_payment_tokens: false,
          experience_context: {
            brand_name: "Mandate",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            return_url: `${base}/wallet?setup=approved`,
            cancel_url: `${base}/wallet?setup=cancelled`,
          },
        },
      },
    },
  });
}

/**
 * Alternative funding source: vault a card server-side. No buyer login is
 * involved, so it also serves judges who cannot complete a sandbox PayPal
 * login. In sandbox the PayPal test card 4111 1111 1111 1111 is accepted.
 */
export async function createCardSetupToken(walletId: string, card: { number: string; expiry: string; name: string }) {
  const base = env.app.url;
  return paypal<SetupToken>({
    method: "POST",
    path: "/v3/vault/setup-tokens",
    requestId: `setup-card-${walletId}-${Date.now()}`,
    body: {
      customer: { id: walletId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 22) },
      payment_source: {
        card: {
          number: card.number.replace(/\s+/g, ""),
          expiry: card.expiry,
          name: card.name,
          billing_address: { address_line_1: "1 Main St", admin_area_2: "San Jose", admin_area_1: "CA", postal_code: "95131", country_code: "US" },
          verification_method: "SCA_WHEN_REQUIRED",
          experience_context: { brand_name: "Mandate", return_url: `${base}/wallet?setup=approved`, cancel_url: `${base}/wallet?setup=cancelled` },
        },
      },
    },
  });
}

/** Step 2: exchange the approved setup token for a permanent payment token. */
export async function createPaymentToken(setupTokenId: string) {
  return paypal<PaymentToken>({
    method: "POST",
    path: "/v3/vault/payment-tokens",
    requestId: `pt-${setupTokenId}`,
    body: { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } },
  });
}

export async function getPaymentToken(id: string) {
  return paypal<PaymentToken>({ method: "GET", path: `/v3/vault/payment-tokens/${id}` });
}

export async function deletePaymentToken(id: string) {
  await paypal({ method: "DELETE", path: `/v3/vault/payment-tokens/${id}` });
}
