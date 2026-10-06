/**
 * Central place for environment configuration. Everything is optional at import
 * time so the app can boot (and show setup hints) before secrets are present.
 */
export const env = {
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
    env: (process.env.PAYPAL_ENV ?? "sandbox") as "sandbox" | "live",
    webhookId: process.env.PAYPAL_WEBHOOK_ID ?? "",
    get baseUrl() {
      return this.env === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
    },
    get configured() {
      return Boolean(this.clientId && this.clientSecret);
    },
  },
  app: {
    /** Public origin used for PayPal return URLs and MCP connect snippets. */
    get url() {
      return (
        process.env.APP_URL ??
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000")
      );
    },
    /** Optional PIN that guards owner actions (approve/deny, mandate edits). */
    ownerPin: process.env.OWNER_PIN ?? "",
  },
  db: {
    url: process.env.DATABASE_URL ?? "",
  },
  ai: {
    model: process.env.AI_MODEL ?? "",
  },
};
