import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const DDL = `
CREATE TABLE IF NOT EXISTS wallets (
  id text PRIMARY KEY,
  owner_name text NOT NULL,
  payer_email text,
  payer_name text,
  payment_token_id text,
  setup_token_id text,
  source_type text NOT NULL DEFAULT 'paypal',
  card_brand text,
  card_last4 text,
  status text NOT NULL DEFAULT 'unlinked',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'paypal';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS card_last4 text;
CREATE TABLE IF NOT EXISTS mandates (
  id text PRIMARY KEY,
  wallet_id text NOT NULL,
  source_text text NOT NULL,
  policy jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  compiled_by text NOT NULL DEFAULT 'llm',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agents (
  id text PRIMARY KEY,
  wallet_id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  api_key_hash text NOT NULL,
  api_key_prefix text NOT NULL,
  api_key_demo text,
  color text NOT NULL DEFAULT '#5b8def',
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS intents (
  id text PRIMARY KEY,
  wallet_id text NOT NULL,
  agent_id text NOT NULL,
  mandate_id text,
  kind text NOT NULL,
  merchant text NOT NULL DEFAULT '',
  recipient_email text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  category text NOT NULL DEFAULT 'uncategorized',
  recurring boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'evaluating',
  decision jsonb,
  risk integer,
  paypal_order_id text,
  paypal_capture_id text,
  paypal_payout_batch_id text,
  paypal_refund_id text,
  error text,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS intents_wallet_created ON intents (wallet_id, created_at DESC);
CREATE TABLE IF NOT EXISTS ledger_events (
  seq serial PRIMARY KEY,
  id text NOT NULL,
  intent_id text,
  agent_id text,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text NOT NULL,
  hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_events_prev_hash_unique ON ledger_events (prev_hash);
CREATE TABLE IF NOT EXISTS webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  resource_id text,
  summary text NOT NULL DEFAULT '',
  verified boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
`;

declare global {
  var __mandateDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  let db: Db;
  if (env.db.url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(env.db.url), { schema }) as unknown as Db;
  } else {
    // Embedded Postgres (PGlite) for local development and judges running the
    // repo without provisioning a database. Data persists under ./.data/pglite.
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dataDir = process.env.PGLITE_DIR ?? "./.data/pglite";
    const client = new PGlite(dataDir);
    db = drizzle(client, { schema }) as unknown as Db;
  }
  for (const statement of DDL.split(";")) {
    const s = statement.trim();
    if (s) await db.execute(sql.raw(s));
  }
  return db;
}

/** Returns the shared database handle, creating tables on first use. */
export function getDb(): Promise<Db> {
  if (!globalThis.__mandateDb) {
    globalThis.__mandateDb = connect().catch((e) => {
      globalThis.__mandateDb = undefined;
      throw e;
    });
  }
  return globalThis.__mandateDb;
}

export const dbKind = () => (env.db.url ? "neon-postgres" : "pglite-embedded");
export { schema };
