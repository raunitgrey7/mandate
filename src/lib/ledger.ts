import { desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, sha256 } from "@/lib/ids";
import type { LedgerEvent } from "@/lib/db/schema";

export const GENESIS = "0".repeat(64);

/** Key-sorted JSON so the hash is independent of how the database stores jsonb. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/**
 * Append-only, hash-chained audit log. Each entry commits to the previous
 * entry's hash, so any edit to history is detectable with verifyLedger().
 * Entries carry the PayPal identifiers (order, capture, payout batch, refund)
 * so a receipt chain reads: intent -> decision -> PayPal money movement.
 */
export async function appendLedger(args: { intentId?: string | null; agentId?: string | null; type: string; payload: Record<string, unknown> }) {
  const db = await getDb();
  const [last] = await db.select().from(schema.ledgerEvents).orderBy(desc(schema.ledgerEvents.seq)).limit(1);
  const prevHash = last?.hash ?? GENESIS;
  const id = newId("evt");
  const createdAt = new Date();
  const hash = sha256(canonical({ id, prevHash, type: args.type, intentId: args.intentId ?? null, payload: args.payload, createdAt: createdAt.toISOString() }));
  const [row] = await db
    .insert(schema.ledgerEvents)
    .values({ id, intentId: args.intentId ?? null, agentId: args.agentId ?? null, type: args.type, payload: { ...args.payload, _at: createdAt.toISOString() }, prevHash, hash, createdAt })
    .returning();
  return row;
}

export async function listLedger(limit = 500): Promise<LedgerEvent[]> {
  const db = await getDb();
  return db.select().from(schema.ledgerEvents).orderBy(desc(schema.ledgerEvents.seq)).limit(limit);
}

export async function verifyLedger(): Promise<{ ok: boolean; count: number; brokenAt: number | null }> {
  const db = await getDb();
  const rows = await db.select().from(schema.ledgerEvents).orderBy(schema.ledgerEvents.seq);
  let prev = GENESIS;
  for (const r of rows) {
    const payload = { ...r.payload };
    const at = String(payload._at ?? r.createdAt.toISOString());
    delete payload._at;
    const expected = sha256(canonical({ id: r.id, prevHash: prev, type: r.type, intentId: r.intentId ?? null, payload, createdAt: at }));
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, count: rows.length, brokenAt: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}

export async function ledgerCount() {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.ledgerEvents);
  return Number(r?.n ?? 0);
}
