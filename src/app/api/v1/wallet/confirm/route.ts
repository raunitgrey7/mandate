import { body, handle, json, requireOwner } from "@/lib/http";
import { createPaymentToken, deletePaymentToken } from "@/lib/paypal/vault";
import { getWallet, updateWallet } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

/** After the owner approves in PayPal: exchange the setup token for a permanent payment token. */
export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const wallet = await getWallet();
    const { setupTokenId } = await body<{ setupTokenId?: string }>(req).catch(() => ({ setupTokenId: undefined }));
    const id = setupTokenId ?? wallet.setupTokenId;
    if (!id) return json({ error: "No pending setup token" }, { status: 400 });
    const token = await createPaymentToken(id);
    const pp = token.payment_source?.paypal;
    const updated = await updateWallet({
      paymentTokenId: token.id,
      payerEmail: pp?.email_address ?? null,
      payerName: [pp?.name?.given_name, pp?.name?.surname].filter(Boolean).join(" ") || null,
      sourceType: "paypal",
      cardBrand: null,
      cardLast4: null,
      status: "linked",
    });
    await appendLedger({ type: "wallet.linked", payload: { paymentTokenId: token.id, payerEmail: pp?.email_address, usageType: pp?.usage_type } });
    return json({ wallet: { ...updated, paymentTokenId: `${token.id.slice(0, 4)}…${token.id.slice(-4)}` } });
  });
}

/** Unlink: delete the vaulted token at PayPal and forget it. */
export async function DELETE(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const wallet = await getWallet();
    if (wallet.paymentTokenId) await deletePaymentToken(wallet.paymentTokenId).catch(() => undefined);
    await updateWallet({ paymentTokenId: null, setupTokenId: null, payerEmail: null, payerName: null, sourceType: "paypal", cardBrand: null, cardLast4: null, status: "unlinked" });
    await appendLedger({ type: "wallet.unlinked", payload: {} });
    return json({ ok: true });
  });
}
