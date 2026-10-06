import { handle, json } from "@/lib/http";
import { getActiveMandate, getWallet, listAgents, listIntents, spendUsage } from "@/lib/store";
import { listLedger, verifyLedger } from "@/lib/ledger";
import { getDb, schema } from "@/lib/db";
import { desc } from "drizzle-orm";

/** Everything the owner dashboard needs in one call. */
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const withLedger = url.searchParams.get("ledger") === "1";
    const wallet = await getWallet();
    const [agents, intents, mandate] = await Promise.all([listAgents(), listIntents(300), getActiveMandate()]);
    const usage = await spendUsage(agents);
    const db = await getDb();
    const webhooks = await db.select().from(schema.webhookEvents).orderBy(desc(schema.webhookEvents.receivedAt)).limit(50);
    const payload: Record<string, unknown> = {
      wallet: { ...wallet, paymentTokenId: wallet.paymentTokenId ? "•••• linked" : null },
      agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role, color: a.color, revoked: a.revoked, apiKeyPrefix: a.apiKeyPrefix })),
      intents,
      mandate,
      usage,
      pending: intents.filter((i) => i.status === "needs_human"),
      webhooks,
    };
    if (withLedger) {
      payload.ledger = await listLedger(1000);
      payload.ledgerVerification = await verifyLedger();
    }
    return json(payload);
  });
}
