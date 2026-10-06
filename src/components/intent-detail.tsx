"use client";

import { useState } from "react";
import type { Intent } from "@/lib/db/schema";
import { api, money, when } from "@/lib/client";
import { Pill } from "@/components/ui";
import { Check, ExternalLink, RotateCcw, X } from "lucide-react";

export function IntentDetail({ intent, agent, onChange, onClose }: { intent: Intent; agent?: { name: string; color: string; role?: string }; onChange?: () => void; onClose?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const act = async (kind: "approve" | "deny" | "refund") => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "refund") await api(`/api/v1/intents/${intent.id}/refund`, { method: "POST", body: JSON.stringify({ note: "Refunded by owner" }) });
      else await api(`/api/v1/intents/${intent.id}/decide`, { method: "POST", body: JSON.stringify({ approve: kind === "approve" }) });
      onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const d = intent.decision;
  const sandboxTx = intent.paypalCaptureId ? `https://www.sandbox.paypal.com/activity/payment/${intent.paypalCaptureId}` : null;
  return (
    <div className="fade-up">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            <span className="h-2 w-2 rounded-full" style={{ background: agent?.color ?? "#888" }} />
            {agent?.name ?? "Agent"} · {when(intent.createdAt)} · <span className="num">{intent.id}</span>
          </div>
          <div className="display text-[28px] leading-tight mt-1">
            {intent.kind === "payout" ? `Pay ${intent.merchant}` : intent.merchant} <span className="num text-[22px] text-fg-2">{money(intent.amountCents, intent.currency)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill status={intent.status} />
          {onClose && (
            <button className="btn btn-sm" onClick={onClose} aria-label="Close">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="text-[13.5px] text-fg-2 mt-3">
        <span className="text-fg-3">Agent&apos;s reason: </span>
        {intent.reason}
      </p>

      {intent.items.length > 0 && (
        <div className="mt-3 card bg-bg-2 p-3">
          {intent.items.map((it, i) => (
            <div key={i} className="flex justify-between text-[13px] py-1 border-b border-line last:border-0">
              <span>
                {it.quantity > 1 && <span className="text-fg-3 num">{it.quantity} × </span>}
                {it.name}
              </span>
              <span className="num text-fg-2">{money(it.unitCents * it.quantity)}</span>
            </div>
          ))}
        </div>
      )}

      {d && (
        <div className="mt-4">
          <div className="text-[12px] uppercase tracking-wide text-fg-3 mb-2">
            Policy evaluation · {d.reviewer === "llm" ? "AI review" : "rule-based review"} · risk <span className="num text-fg">{intent.risk ?? d.review?.risk ?? 0}</span>/100
          </div>
          <ul className="space-y-1">
            {d.rules.map((r, i) => (
              <li key={i} className="flex gap-2 text-[13px]">
                <span className={`mt-[3px] h-3.5 w-3.5 rounded-full shrink-0 border ${r.outcome === "pass" ? "border-paid/50 bg-paid/15" : r.outcome === "escalate" ? "border-wait/50 bg-wait/15" : "border-deny/50 bg-deny/15"}`} />
                <span>
                  <span className="num text-fg-3 text-[12px] mr-1.5">{r.rule}</span>
                  <span className={r.outcome === "pass" ? "text-fg-2" : "text-fg"}>{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {d.review && (
            <div className="mt-3 text-[13px] text-fg-2 border-l-2 border-accent/50 pl-3">
              <span className="text-fg-3">Reviewer: </span>
              {d.review.rationale}
              {d.review.flags.length > 0 && <div className="text-wait mt-1">{d.review.flags.join(" · ")}</div>}
            </div>
          )}
        </div>
      )}

      {(intent.paypalOrderId || intent.paypalCaptureId || intent.paypalPayoutBatchId || intent.paypalRefundId || intent.error) && (
        <div className="mt-4 card bg-bg-2 p-3 text-[12.5px] space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-fg-3 mb-1">PayPal</div>
          {intent.paypalOrderId && (
            <div>
              <span className="text-fg-3">Order </span>
              <span className="num">{intent.paypalOrderId}</span>
            </div>
          )}
          {intent.paypalCaptureId && (
            <div className="flex items-center gap-2">
              <span className="text-fg-3">Capture </span>
              <span className="num">{intent.paypalCaptureId}</span>
              {sandboxTx && (
                <a className="text-accent inline-flex items-center gap-1" href={sandboxTx} target="_blank" rel="noreferrer">
                  view <ExternalLink size={11} />
                </a>
              )}
            </div>
          )}
          {intent.paypalPayoutBatchId && (
            <div>
              <span className="text-fg-3">Payout batch </span>
              <span className="num">{intent.paypalPayoutBatchId}</span>
            </div>
          )}
          {intent.paypalRefundId && (
            <div>
              <span className="text-fg-3">Refund </span>
              <span className="num">{intent.paypalRefundId}</span>
            </div>
          )}
          {intent.error && <div className="text-deny">{intent.error}</div>}
        </div>
      )}

      {err && <div className="mt-3 text-[13px] text-deny">{err}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        {intent.status === "needs_human" && (
          <>
            <button className="btn btn-paid" disabled={busy !== null} onClick={() => act("approve")}>
              <Check size={15} /> {busy === "approve" ? "Paying via PayPal…" : "Approve and pay"}
            </button>
            <button className="btn btn-deny" disabled={busy !== null} onClick={() => act("deny")}>
              <X size={15} /> Deny
            </button>
          </>
        )}
        {intent.status === "paid" && intent.paypalCaptureId && (
          <button className="btn" disabled={busy !== null} onClick={() => act("refund")}>
            <RotateCcw size={14} /> {busy === "refund" ? "Refunding…" : "Refund"}
          </button>
        )}
      </div>
    </div>
  );
}
