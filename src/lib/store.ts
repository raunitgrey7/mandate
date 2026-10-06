import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId, newApiKey, sha256 } from "@/lib/ids";
import { DEFAULT_MANDATE_TEXT, DEFAULT_POLICY, type Policy } from "@/lib/policy/schema";
import type { Agent, Intent, Mandate, Wallet } from "@/lib/db/schema";
import type { SpendUsage } from "@/lib/policy/engine";

/** Single-tenant demo: one wallet, created on first use. */
export const WALLET_ID = "wal_household";

export async function getWallet(): Promise<Wallet> {
  const db = await getDb();
  const [w] = await db.select().from(schema.wallets).where(eq(schema.wallets.id, WALLET_ID));
  if (w) return w;
  const [created] = await db.insert(schema.wallets).values({ id: WALLET_ID, ownerName: "Household" }).returning();
  await ensureDefaultMandate();
  await ensureDefaultAgents();
  return created;
}

export async function updateWallet(patch: Partial<Wallet>) {
  const db = await getDb();
  const [w] = await db.update(schema.wallets).set(patch).where(eq(schema.wallets.id, WALLET_ID)).returning();
  return w;
}

export async function getActiveMandate(): Promise<Mandate | null> {
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.mandates)
    .where(and(eq(schema.mandates.walletId, WALLET_ID), eq(schema.mandates.active, true)))
    .orderBy(desc(schema.mandates.version))
    .limit(1);
  return m ?? null;
}

export async function listMandates(): Promise<Mandate[]> {
  const db = await getDb();
  return db.select().from(schema.mandates).where(eq(schema.mandates.walletId, WALLET_ID)).orderBy(desc(schema.mandates.version));
}

export async function saveMandate(sourceText: string, policy: Policy, compiledBy: string): Promise<Mandate> {
  const db = await getDb();
  const [latest] = await db.select({ v: sql<number>`coalesce(max(version), 0)` }).from(schema.mandates).where(eq(schema.mandates.walletId, WALLET_ID));
  await db.update(schema.mandates).set({ active: false }).where(eq(schema.mandates.walletId, WALLET_ID));
  const [m] = await db
    .insert(schema.mandates)
    .values({ id: newId("mnd"), walletId: WALLET_ID, sourceText, policy, version: Number(latest?.v ?? 0) + 1, active: true, compiledBy })
    .returning();
  return m;
}

async function ensureDefaultMandate() {
  if (!(await getActiveMandate())) await saveMandate(DEFAULT_MANDATE_TEXT, DEFAULT_POLICY, "default");
}

export const DEMO_AGENTS = [
  { name: "Pantry", role: "Restocks groceries and household supplies every week", color: "#2fbf71" },
  { name: "Travel", role: "Books trains, flights and hotels for upcoming trips", color: "#5b8def" },
  { name: "Growth", role: "Buys tools and subscriptions to grow the family side business", color: "#f2a93b" },
  { name: "Ops", role: "Schedules home services and pays contractors when jobs are done", color: "#c76bd9" },
];

async function ensureDefaultAgents() {
  const db = await getDb();
  const existing = await db.select().from(schema.agents).where(eq(schema.agents.walletId, WALLET_ID));
  if (existing.length) return;
  for (const a of DEMO_AGENTS) await createAgent(a.name, a.role, a.color);
}

export async function createAgent(name: string, role: string, color?: string): Promise<{ agent: Agent; apiKey: string }> {
  const db = await getDb();
  const { key, hash, prefix } = newApiKey();
  const [agent] = await db
    .insert(schema.agents)
    .values({ id: newId("agt"), walletId: WALLET_ID, name, role, apiKeyHash: hash, apiKeyPrefix: prefix, apiKeyDemo: key, color: color ?? "#5b8def" })
    .returning();
  return { agent, apiKey: key };
}

export async function listAgents(): Promise<Agent[]> {
  const db = await getDb();
  return db.select().from(schema.agents).where(eq(schema.agents.walletId, WALLET_ID)).orderBy(schema.agents.createdAt);
}

export async function getAgent(id: string): Promise<Agent | null> {
  const db = await getDb();
  const [a] = await db.select().from(schema.agents).where(eq(schema.agents.id, id));
  return a ?? null;
}

export async function agentFromApiKey(key: string | null | undefined): Promise<Agent | null> {
  if (!key) return null;
  const db = await getDb();
  const [a] = await db.select().from(schema.agents).where(and(eq(schema.agents.apiKeyHash, sha256(key)), eq(schema.agents.revoked, false)));
  return a ?? null;
}

export async function revokeAgent(id: string) {
  const db = await getDb();
  await db.update(schema.agents).set({ revoked: true }).where(eq(schema.agents.id, id));
}

export async function listIntents(limit = 200): Promise<Intent[]> {
  const db = await getDb();
  return db.select().from(schema.intents).where(eq(schema.intents.walletId, WALLET_ID)).orderBy(desc(schema.intents.createdAt)).limit(limit);
}

export async function getIntent(id: string): Promise<Intent | null> {
  const db = await getDb();
  const [i] = await db.select().from(schema.intents).where(eq(schema.intents.id, id));
  return i ?? null;
}

export async function updateIntent(id: string, patch: Partial<Intent>): Promise<Intent> {
  const db = await getDb();
  const [i] = await db.update(schema.intents).set(patch).where(eq(schema.intents.id, id)).returning();
  return i;
}

const COMMITTED = ["paid", "auto_approved", "approved", "needs_human"] as const;

/** Spend that counts against budgets: paid, plus in-flight approvals (so two agents cannot race past a cap). */
export async function spendUsage(agents: Agent[]): Promise<SpendUsage> {
  const db = await getDb();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await db
    .select()
    .from(schema.intents)
    .where(and(eq(schema.intents.walletId, WALLET_ID), gte(schema.intents.createdAt, monthStart), inArray(schema.intents.status, [...COMMITTED])));
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(dayStart);
  weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
  const byId = new Map(agents.map((a) => [a.id, a.name.toLowerCase()]));
  const usage: SpendUsage = { day: 0, week: 0, month: 0, agentMonth: {}, payoutMonth: 0, knownMerchants: [] };
  for (const r of rows) {
    if (r.kind === "payout") {
      usage.payoutMonth += r.amountCents;
      continue;
    }
    usage.month += r.amountCents;
    if (r.createdAt >= weekStart) usage.week += r.amountCents;
    if (r.createdAt >= dayStart) usage.day += r.amountCents;
    const name = byId.get(r.agentId) ?? r.agentId;
    usage.agentMonth[name] = (usage.agentMonth[name] ?? 0) + r.amountCents;
  }
  const paid = await db
    .select({ merchant: schema.intents.merchant })
    .from(schema.intents)
    .where(and(eq(schema.intents.walletId, WALLET_ID), eq(schema.intents.status, "paid")));
  usage.knownMerchants = [...new Set(paid.map((p) => p.merchant.toLowerCase()).filter(Boolean))];
  return usage;
}

export async function resetDemo() {
  const db = await getDb();
  await db.delete(schema.intents);
  await db.delete(schema.ledgerEvents);
  await db.delete(schema.webhookEvents);
}
