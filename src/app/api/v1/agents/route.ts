import { body, handle, json, requireOwner } from "@/lib/http";
import { createAgent, getWallet, listAgents } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

export async function GET() {
  return handle(async () => {
    await getWallet();
    const agents = await listAgents();
    return json({ agents: agents.map((a) => ({ ...a, apiKeyHash: undefined })) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const { name, role, color } = await body<{ name: string; role?: string; color?: string }>(req);
    if (!name?.trim()) return json({ error: "Name required" }, { status: 400 });
    await getWallet();
    const { agent, apiKey } = await createAgent(name.trim(), role?.trim() ?? "", color);
    await appendLedger({ agentId: agent.id, type: "agent.created", payload: { name: agent.name, role: agent.role } });
    return json({ agent: { ...agent, apiKeyHash: undefined }, apiKey }, { status: 201 });
  });
}
