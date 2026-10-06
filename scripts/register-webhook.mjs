// Registers the PayPal webhook for a deployment and prints the id to put in PAYPAL_WEBHOOK_ID.
// usage: node scripts/register-webhook.mjs https://your-app.vercel.app
import fs from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const l of fs.readFileSync(f, "utf8").split("\n")) {
    const m = l.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const base = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const origin = process.argv[2] ?? process.env.APP_URL;
if (!origin) throw new Error("pass the public origin, e.g. node scripts/register-webhook.mjs https://mandate.vercel.app");
const url = `${origin.replace(/\/$/, "")}/api/webhooks/paypal`;

const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
const tok = await fetch(`${base}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" }).then((r) => r.json());
const h = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };
const list = await fetch(`${base}/v1/notifications/webhooks`, { headers: h }).then((r) => r.json());
let hook = list.webhooks?.find((w) => w.url === url);
if (!hook) {
  const events = [
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
  hook = await fetch(`${base}/v1/notifications/webhooks`, { method: "POST", headers: h, body: JSON.stringify({ url, event_types: events.map((name) => ({ name })) }) }).then((r) => r.json());
}
if (!hook.id) throw new Error(JSON.stringify(hook));
console.log(`Webhook ${hook.id} -> ${hook.url}`);
console.log(`Set PAYPAL_WEBHOOK_ID=${hook.id}`);
