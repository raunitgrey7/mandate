import { handle, json, requireAgent } from "@/lib/http";
import { toolGetStatus } from "@/lib/agent-tools";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const agent = await requireAgent(req);
    const { id } = await params;
    return json(await toolGetStatus(agent, id));
  });
}
