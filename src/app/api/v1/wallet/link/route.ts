import { handle, json, requireOwner } from "@/lib/http";
import { createSetupToken } from "@/lib/paypal/vault";
import { getWallet, updateWallet } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

/** Starts the one-time PayPal approval (Vault setup token). */
export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const wallet = await getWallet();
    const setup = await createSetupToken(wallet.id);
    const approve = setup.links.find((l) => l.rel === "approve")?.href;
    await updateWallet({ setupTokenId: setup.id, status: "pending" });
    await appendLedger({ type: "wallet.setup_token.created", payload: { setupTokenId: setup.id } });
    return json({ setupTokenId: setup.id, approveUrl: approve });
  });
}
