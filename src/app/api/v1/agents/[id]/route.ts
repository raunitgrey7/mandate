import { handle, json, requireOwner } from "@/lib/http";
import { getAgent, revokeAgent } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireOwner(req);
    const { id } = await params;
    const agent = await getAgent(id);
    if (!agent) return json({ error: "Not found" }, { status: 404 });
    await revokeAgent(id);
    await appendLedger({ agentId: id, type: "agent.revoked", payload: { name: agent.name } });
    return json({ ok: true });
  });
}
