import { handle, json, requireOwner } from "@/lib/http";
import { resetDemo } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

/** Clears intents, ledger and webhook events. Keeps the wallet link, mandate and agent keys. */
export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    await resetDemo();
    await appendLedger({ type: "demo.reset", payload: {} });
    return json({ ok: true });
  });
}
