import { body, handle, json, requireOwner } from "@/lib/http";
import { refundIntent } from "@/lib/intents";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    requireOwner(req);
    const { id } = await params;
    const { note } = await body<{ note?: string }>(req).catch(() => ({ note: "" }));
    return json({ intent: await refundIntent(id, note ?? "Refunded by owner via Mandate") });
  });
}
