import { z } from "zod";

/**
 * A compiled mandate. Every amount is in the wallet currency (USD) as a plain
 * number, null means "no limit". The owner writes prose; the compiler produces
 * this object; the engine enforces it deterministically.
 */
export const PolicySchema = z.object({
  currency: z.literal("USD").default("USD"),
  limits: z
    .object({
      perTransaction: z.number().nullable().describe("Hard cap for a single purchase. Over this = denied."),
      daily: z.number().nullable(),
      weekly: z.number().nullable(),
      monthly: z.number().nullable().describe("Total budget across all agents per calendar month."),
    })
    .describe("Spending caps. Exceeding daily/weekly/monthly escalates to the owner; exceeding perTransaction denies."),
  approvalAbove: z
    .number()
    .nullable()
    .describe("Any single purchase above this amount needs the owner's one-tap approval."),
  categories: z.object({
    allowed: z.array(z.string()).describe("If non-empty, only these categories are allowed."),
    blocked: z.array(z.string()).describe("Always denied, e.g. alcohol, gambling, tobacco, weapons."),
  }),
  merchants: z.object({
    allowed: z.array(z.string()).describe("If non-empty, only these merchants are allowed (case-insensitive substring match)."),
    blocked: z.array(z.string()),
  }),
  agents: z
    .array(
      z.object({
        name: z.string().describe("Agent name as registered in Mandate, case-insensitive."),
        monthly: z.number().nullable(),
        perTransaction: z.number().nullable(),
        categories: z.array(z.string()).describe("If non-empty, this agent may only buy in these categories."),
      }),
    )
    .describe("Per-agent overrides. Only include agents the mandate text names explicitly."),
  payouts: z.object({
    enabled: z.boolean(),
    perPayout: z.number().nullable(),
    monthly: z.number().nullable(),
    recipients: z.array(z.string()).describe("Allowed recipient emails or names. Empty = anyone."),
  }),
  subscriptions: z.object({
    allowed: z.boolean(),
    maxMonthly: z.number().nullable().describe("Max recurring monthly amount per subscription."),
  }),
  hours: z
    .object({
      start: z.string().describe("HH:MM 24h"),
      end: z.string().describe("HH:MM 24h"),
      timezone: z.string(),
    })
    .nullable()
    .describe("If set, purchases outside this window escalate to the owner."),
  alwaysAsk: z
    .array(z.string())
    .describe("Free-text situations that must always go to the owner, e.g. 'first purchase from a new merchant'."),
  rationale: z
    .array(z.string())
    .describe("One line per sentence of the mandate explaining how it was mapped to fields."),
});

export type Policy = z.infer<typeof PolicySchema>;

export const DEFAULT_MANDATE_TEXT = `Our household agents may spend up to $400 a month in total.
Groceries and household supplies are fine, up to $120 per order.
Any single purchase over $75 needs my approval.
Never buy alcohol, tobacco, gambling or anything age-restricted.
The travel agent can book trains and flights up to $500 each, but always ask me first.
Subscriptions are allowed only if they can be cancelled monthly and cost under $30 a month.
The ops agent can pay the dog walker (Priya) up to $40 per visit, max $200 a month, no other payouts.`;

export const DEFAULT_POLICY: Policy = {
  currency: "USD",
  limits: { perTransaction: 500, daily: null, weekly: null, monthly: 400 },
  approvalAbove: 75,
  categories: { allowed: [], blocked: ["alcohol", "tobacco", "gambling", "age-restricted"] },
  merchants: { allowed: [], blocked: [] },
  agents: [
    { name: "Pantry", monthly: null, perTransaction: 120, categories: ["groceries", "household"] },
    { name: "Travel", monthly: null, perTransaction: 500, categories: ["travel"] },
    { name: "Ops", monthly: null, perTransaction: null, categories: [] },
  ],
  payouts: { enabled: true, perPayout: 40, monthly: 200, recipients: ["Priya"] },
  subscriptions: { allowed: true, maxMonthly: 30 },
  hours: null,
  alwaysAsk: ["any travel booking"],
  rationale: [
    "Household agents may spend up to $400 a month in total -> limits.monthly = 400.",
    "Groceries and household supplies up to $120 per order -> agents[Pantry].perTransaction = 120, categories groceries/household.",
    "Any single purchase over $75 needs my approval -> approvalAbove = 75.",
    "Never buy alcohol, tobacco, gambling or anything age-restricted -> categories.blocked.",
    "Travel agent can book trains and flights up to $500 each but always ask first -> agents[Travel].perTransaction = 500, alwaysAsk any travel booking.",
    "Subscriptions allowed if cancellable monthly and under $30 a month -> subscriptions.allowed = true, maxMonthly = 30.",
    "Ops agent can pay the dog walker (Priya) up to $40 per visit, max $200 a month, no other payouts -> payouts.enabled, perPayout 40, monthly 200, recipients [Priya].",
  ],
};

export const CATEGORIES = [
  "groceries",
  "household",
  "travel",
  "software",
  "subscriptions",
  "dining",
  "entertainment",
  "health",
  "education",
  "services",
  "electronics",
  "clothing",
  "alcohol",
  "tobacco",
  "gambling",
  "age-restricted",
  "other",
] as const;
