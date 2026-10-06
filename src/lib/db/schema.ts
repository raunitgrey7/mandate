import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";
import type { Policy } from "@/lib/policy/schema";

export const wallets = pgTable("wallets", {
  id: text("id").primaryKey(),
  ownerName: text("owner_name").notNull(),
  payerEmail: text("payer_email"),
  payerName: text("payer_name"),
  paymentTokenId: text("payment_token_id"),
  setupTokenId: text("setup_token_id"),
  sourceType: text("source_type").$type<"paypal" | "card">().notNull().default("paypal"),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),
  status: text("status").notNull().default("unlinked"), // unlinked | pending | linked
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mandates = pgTable("mandates", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull(),
  sourceText: text("source_text").notNull(),
  policy: jsonb("policy").$type<Policy>().notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  compiledBy: text("compiled_by").notNull().default("llm"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default(""),
  apiKeyHash: text("api_key_hash").notNull(),
  apiKeyPrefix: text("api_key_prefix").notNull(),
  /** Demo convenience: the raw key, so the playground and judges can call the API without re-issuing. A production build would keep only the hash. */
  apiKeyDemo: text("api_key_demo"),
  color: text("color").notNull().default("#5b8def"),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type IntentStatus =
  | "evaluating"
  | "auto_approved"
  | "needs_human"
  | "approved"
  | "denied"
  | "paid"
  | "failed"
  | "refunded";

export type IntentItem = { name: string; quantity: number; unitCents: number };

export type RuleResult = {
  rule: string;
  outcome: "pass" | "deny" | "escalate";
  detail: string;
};

export type LlmReview = {
  category: string;
  risk: number;
  rationale: string;
  flags: string[];
  escalate: boolean;
};

export type Decision = {
  verdict: "auto_approved" | "needs_human" | "denied";
  rules: RuleResult[];
  review: LlmReview | null;
  reviewer: "llm" | "heuristic";
  summary: string;
};

export const intents = pgTable("intents", {
  id: text("id").primaryKey(),
  walletId: text("wallet_id").notNull(),
  agentId: text("agent_id").notNull(),
  mandateId: text("mandate_id"),
  kind: text("kind").$type<"purchase" | "payout">().notNull(),
  merchant: text("merchant").notNull().default(""),
  recipientEmail: text("recipient_email"),
  items: jsonb("items").$type<IntentItem[]>().notNull().default([]),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  category: text("category").notNull().default("uncategorized"),
  recurring: boolean("recurring").notNull().default(false),
  reason: text("reason").notNull().default(""),
  status: text("status").$type<IntentStatus>().notNull().default("evaluating"),
  decision: jsonb("decision").$type<Decision>(),
  risk: integer("risk"),
  paypalOrderId: text("paypal_order_id"),
  paypalCaptureId: text("paypal_capture_id"),
  paypalPayoutBatchId: text("paypal_payout_batch_id"),
  paypalRefundId: text("paypal_refund_id"),
  error: text("error"),
  decidedBy: text("decided_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const ledgerEvents = pgTable("ledger_events", {
  seq: serial("seq").primaryKey(),
  id: text("id").notNull(),
  intentId: text("intent_id"),
  agentId: text("agent_id"),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  prevHash: text("prev_hash").notNull(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  resourceId: text("resource_id"),
  summary: text("summary").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;
export type Mandate = typeof mandates.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Intent = typeof intents.$inferSelect;
export type LedgerEvent = typeof ledgerEvents.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
