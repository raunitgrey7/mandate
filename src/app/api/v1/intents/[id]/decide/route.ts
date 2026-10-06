import { body, handle, json, requireOwner } from "@/lib/http";
import { decideIntent } from "@/lib/intents";

export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireOwner(req);
    const { id } = await params;
    const { approve, note } = await body<{ approve: boolean; note?: string }>(req);
    const intent = await decideIntent(id, Boolean(approve), "owner", note ?? "");
    return json({ intent });
  });
}
