import { body, handle, json, requireOwner } from "@/lib/http";
import { createCardSetupToken, createPaymentToken } from "@/lib/paypal/vault";
import { getWallet, updateWallet } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

/**
 * Vault a card as the funding source. Setup token and payment token are
 * created back to back; the card number never touches the database.
 */
export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const wallet = await getWallet();
    const { number, expiry, name } = await body<{ number: string; expiry: string; name: string }>(req);
    if (!/^\d{12,19}$/.test((number ?? "").replace(/\s+/g, "")) || !/^\d{4}-\d{2}$/.test(expiry ?? "") || !name?.trim()) {
      return json({ error: "Card number, expiry (YYYY-MM) and name are required" }, { status: 400 });
    }
    const setup = await createCardSetupToken(wallet.id, { number, expiry, name: name.trim() });
    if (setup.status !== "APPROVED") {
      const approve = setup.links?.find((l) => l.rel === "approve")?.href;
      await updateWallet({ setupTokenId: setup.id, status: "pending" });
      return json({ setupTokenId: setup.id, approveUrl: approve, status: setup.status });
    }
    const token = await createPaymentToken(setup.id);
    const card = token.payment_source?.card;
    const updated = await updateWallet({
      paymentTokenId: token.id,
      setupTokenId: setup.id,
      payerEmail: null,
      payerName: card?.name ?? name.trim(),
      sourceType: "card",
      cardBrand: card?.brand ?? null,
      cardLast4: card?.last_digits ?? null,
      status: "linked",
    });
    await appendLedger({ type: "wallet.linked", payload: { paymentTokenId: token.id, source: "card", brand: card?.brand, last4: card?.last_digits } });
    return json({ wallet: { ...updated, paymentTokenId: `${token.id.slice(0, 4)}…${token.id.slice(-4)}` } });
  });
}
