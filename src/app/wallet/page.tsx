"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, useActivity } from "@/lib/client";
import { Card, PageHeader } from "@/components/ui";
import { CreditCard, Link2, ShieldCheck, Unlink } from "lucide-react";

type WalletInfo = {
  wallet: {
    status: string;
    sourceType: "paypal" | "card";
    payerEmail: string | null;
    payerName: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    paymentTokenId: string | null;
    setupTokenId: string | null;
  };
  testCard: { number: string; expiry: string; name: string };
  config: { paypal: boolean; paypalEnv: string; ai: { provider: string; id: string }; db: string; webhook: boolean };
};

function WalletInner() {
  const params = useSearchParams();
  const { reload } = useActivity(5000);
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [card, setCard] = useState({ number: "", expiry: "", name: "" });
  const load = async () => setInfo(await api<WalletInfo>("/api/v1/wallet"));
  useEffect(() => {
    let on = true;
    api<WalletInfo>("/api/v1/wallet").then((r) => {
      if (!on) return;
      setInfo(r);
      setCard((c) => (c.number ? c : r.testCard));
    });
    return () => {
      on = false;
    };
  }, []);

  const confirm = useCallback(async () => {
    setBusy("confirm");
    setErr(null);
    try {
      await api("/api/v1/wallet/confirm", { method: "POST", body: JSON.stringify({}) });
      await load();
      await reload();
      window.history.replaceState(null, "", "/wallet");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [reload]);

  // Returning from a PayPal approval: finish the vault exchange automatically.
  const pendingReturn = params.get("setup") === "approved" && info?.wallet.status === "pending";
  useEffect(() => {
    if (!pendingReturn) return;
    const t = setTimeout(() => void confirm(), 0);
    return () => clearTimeout(t);
  }, [pendingReturn, confirm]);

  const linkPayPal = async () => {
    setBusy("link");
    setErr(null);
    try {
      const r = await api<{ approveUrl: string }>("/api/v1/wallet/link", { method: "POST" });
      window.location.href = r.approveUrl;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };
  const linkCard = async () => {
    setBusy("card");
    setErr(null);
    try {
      const r = await api<{ approveUrl?: string }>("/api/v1/wallet/card", { method: "POST", body: JSON.stringify(card) });
      if (r.approveUrl) {
        window.location.href = r.approveUrl;
        return;
      }
      await load();
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const unlink = async () => {
    setBusy("unlink");
    try {
      await api("/api/v1/wallet/confirm", { method: "DELETE" });
      await load();
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const w = info?.wallet;
  const linked = w?.status === "linked";
  return (
    <>
      <PageHeader kicker="Wallet" title={linked ? <>Linked. Agents never see it.</> : <>Fund it <em className="italic">once</em></>} />
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card title="Funding source">
          {!info ? (
            <div className="text-fg-3 text-sm">Loading…</div>
          ) : linked ? (
            <div>
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-paid/15 border border-paid/30 grid place-items-center text-paid">
                  <ShieldCheck size={20} />
                </span>
                <div>
                  <div className="text-[15px]">{w?.sourceType === "card" ? `${w.cardBrand ?? "Card"} •••• ${w.cardLast4 ?? ""}` : w?.payerName || "PayPal account"}</div>
                  <div className="text-[13px] text-fg-2">{w?.sourceType === "card" ? w.payerName : w?.payerEmail}</div>
                </div>
              </div>
              <dl className="mt-4 text-[13px] grid grid-cols-[150px_1fr] gap-y-1.5">
                <dt className="text-fg-3">Vault token</dt>
                <dd className="num">{w?.paymentTokenId}</dd>
                <dt className="text-fg-3">Source</dt>
                <dd>{w?.sourceType === "card" ? "Vaulted card (payment_source.card.vault_id)" : "PayPal wallet, MERCHANT usage (payment_source.paypal.vault_id)"}</dd>
                <dt className="text-fg-3">Environment</dt>
                <dd>PayPal {info.config.paypalEnv}</dd>
              </dl>
              <button className="btn mt-5" disabled={busy !== null} onClick={unlink}>
                <Unlink size={14} /> {busy === "unlink" ? "Unlinking…" : "Unlink and delete token"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="text-[13px] font-medium mb-1 flex items-center gap-2">
                  <Link2 size={14} className="text-accent" /> PayPal wallet
                </div>
                <p className="text-[13px] text-fg-2 leading-relaxed">
                  Mandate vaults your PayPal wallet with a <span className="num">MERCHANT</span> usage type. You approve once in PayPal; afterwards, allowed purchases are charged with you absent.
                </p>
                {w?.status === "pending" && (
                  <div className="mt-2 text-[13px] text-wait">
                    A setup token is pending. If you already approved in PayPal,{" "}
                    <button className="underline" onClick={confirm} disabled={busy !== null}>
                      finish linking
                    </button>
                    .
                  </div>
                )}
                <button className="btn btn-primary mt-3" disabled={busy !== null || !info.config.paypal} onClick={linkPayPal}>
                  <Link2 size={14} /> {busy === "link" ? "Redirecting to PayPal…" : busy === "confirm" ? "Finishing link…" : "Link with PayPal"}
                </button>
              </div>
              <div className="border-t border-line pt-5">
                <div className="text-[13px] font-medium mb-1 flex items-center gap-2">
                  <CreditCard size={14} className="text-accent" /> Save a card
                </div>
                <p className="text-[13px] text-fg-2 leading-relaxed">
                  Vaulted server-side through the same Vault API, no login step. Prefilled with PayPal&apos;s sandbox test card.
                </p>
                <div className="grid grid-cols-[1fr_120px] gap-2 mt-3">
                  <input className="input num" placeholder="Card number" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} />
                  <input className="input num" placeholder="YYYY-MM" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} />
                  <input className="input col-span-2" placeholder="Name on card" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
                </div>
                <button className="btn btn-primary mt-3" disabled={busy !== null || !info.config.paypal} onClick={linkCard}>
                  <CreditCard size={14} /> {busy === "card" ? "Vaulting…" : "Save card"}
                </button>
              </div>
              {!info.config.paypal && <div className="text-[13px] text-deny">PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.</div>}
            </div>
          )}
          {err && <div className="mt-3 text-[13px] text-deny">{err}</div>}
        </Card>
        <Card title="How money moves">
          <ol className="text-[13.5px] text-fg-2 space-y-2.5 list-decimal pl-5 leading-relaxed">
            <li>
              <b className="text-fg">Vault</b>: POST <span className="num">/v3/vault/setup-tokens</span> (PayPal wallet or card) → POST <span className="num">/v3/vault/payment-tokens</span>.
            </li>
            <li>
              <b className="text-fg">Purchase</b>: agent request passes the mandate → POST <span className="num">/v2/checkout/orders</span> with <span className="num">payment_source.*.vault_id</span>, captured immediately.
            </li>
            <li>
              <b className="text-fg">Payout</b>: POST <span className="num">/v1/payments/payouts</span> to a person&apos;s PayPal email.
            </li>
            <li>
              <b className="text-fg">Refund</b>: POST <span className="num">/v2/payments/captures/:id/refund</span> from the owner&apos;s copilot or inbox.
            </li>
            <li>
              <b className="text-fg">Webhooks</b>: capture, refund, payout and dispute events are verified and pinned to the hash-chained ledger.
            </li>
          </ol>
          {info && (
            <div className="mt-4 text-[12px] text-fg-3 space-y-1">
              <div>AI reviewer: {info.config.ai.provider === "none" ? <span className="text-deny">not configured</span> : `${info.config.ai.provider} · ${info.config.ai.id}`}</div>
              <div>Database: {info.config.db}</div>
              <div>Webhook verification: {info.config.webhook ? "on" : "off (PAYPAL_WEBHOOK_ID not set)"}</div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function WalletPage() {
  return (
    <Suspense fallback={<div className="text-fg-3 text-sm">Loading…</div>}>
      <WalletInner />
    </Suspense>
  );
}
