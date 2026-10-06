"use client";

import { useState } from "react";
import { api, useActivity } from "@/lib/client";
import { Card, PageHeader } from "@/components/ui";
import type { Policy } from "@/lib/policy/schema";
import { Sparkles, Save, History } from "lucide-react";

type Compiled = { policy: Policy; compiledBy: "llm" | "heuristic"; model?: string; ms: number };

const fmt = (n: number | null) => (n === null ? "no limit" : `$${n}`);
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "none");

export default function MandatePage() {
  const { data, reload } = useActivity(5000);
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? data?.mandate?.sourceText ?? "";
  const setText = setDraft;
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [busy, setBusy] = useState<"compile" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const compile = async () => {
    setBusy("compile");
    setErr(null);
    try {
      setCompiled(await api<Compiled>("/api/v1/mandate", { method: "POST", body: JSON.stringify({ text }) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const save = async () => {
    if (!compiled) return;
    setBusy("save");
    setErr(null);
    try {
      await api("/api/v1/mandate", { method: "PUT", body: JSON.stringify({ text, policy: compiled.policy, compiledBy: compiled.compiledBy }) });
      setCompiled(null);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const p = compiled?.policy ?? data?.mandate?.policy;
  const dirty = data?.mandate && text.trim() !== data.mandate.sourceText.trim();
  return (
    <>
      <PageHeader kicker="Mandate" title={<>Write the rules in <em className="italic">English</em></>}>
        <span className="text-[12px] text-fg-3 flex items-center gap-1.5">
          <History size={13} /> v{data?.mandate?.version ?? "–"} active
        </span>
      </PageHeader>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Your mandate">
          <textarea className="input min-h-[300px] text-[14px] leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button className="btn btn-primary" disabled={busy !== null || !text.trim()} onClick={compile}>
              <Sparkles size={14} /> {busy === "compile" ? "Compiling…" : "Compile with AI"}
            </button>
            <button className="btn btn-paid" disabled={busy !== null || !compiled} onClick={save}>
              <Save size={14} /> {busy === "save" ? "Activating…" : "Activate this version"}
            </button>
            {compiled && (
              <span className="text-[12px] text-fg-3">
                compiled by {compiled.compiledBy === "llm" ? compiled.model ?? "AI" : "rule-based fallback"} in {(compiled.ms / 1000).toFixed(1)}s
              </span>
            )}
            {dirty && !compiled && <span className="text-[12px] text-wait">Edited; compile to preview the policy.</span>}
          </div>
          {err && <div className="mt-3 text-[13px] text-deny">{err}</div>}
          <p className="text-[12px] text-fg-3 mt-4 leading-relaxed">
            Numbers and block lists become hard rules enforced in code. Everything else (who, why, &quot;ask me first&quot;) becomes context for the AI reviewer that reads every request before money moves. Agents can never widen their own mandate.
          </p>
        </Card>
        <Card title={compiled ? "Compiled policy (preview)" : "Active policy"} action={<button className="text-[12px] text-accent" onClick={() => setShowJson((s) => !s)}>{showJson ? "Readable" : "JSON"}</button>}>
          {!p ? (
            <div className="text-fg-3 text-sm">Loading…</div>
          ) : showJson ? (
            <pre className="num text-[11.5px] leading-relaxed text-fg-2 overflow-auto scroll-thin max-h-[560px]">{JSON.stringify(p, null, 2)}</pre>
          ) : (
            <div className="space-y-3 text-[13.5px]">
              <Row k="Single purchase cap" v={fmt(p.limits.perTransaction)} />
              <Row k="Auto-approve up to" v={p.approvalAbove === null ? "everything (no threshold)" : `$${p.approvalAbove}; above needs you`} />
              <Row k="Budgets" v={`day ${fmt(p.limits.daily)} · week ${fmt(p.limits.weekly)} · month ${fmt(p.limits.monthly)}`} />
              <Row k="Blocked categories" v={list(p.categories.blocked)} tone="deny" />
              {p.categories.allowed.length > 0 && <Row k="Allowed categories" v={list(p.categories.allowed)} />}
              {(p.merchants.allowed.length > 0 || p.merchants.blocked.length > 0) && <Row k="Merchants" v={`allowed ${list(p.merchants.allowed)} · blocked ${list(p.merchants.blocked)}`} />}
              <Row k="Subscriptions" v={p.subscriptions.allowed ? `allowed, max ${fmt(p.subscriptions.maxMonthly)}/month` : "not allowed"} />
              <Row k="Payouts" v={p.payouts.enabled ? `up to ${fmt(p.payouts.perPayout)} each, ${fmt(p.payouts.monthly)}/month, to ${list(p.payouts.recipients) === "none" ? "anyone" : list(p.payouts.recipients)}` : "not allowed"} />
              {p.hours && <Row k="Hours" v={`${p.hours.start}–${p.hours.end} ${p.hours.timezone}`} />}
              {p.agents.length > 0 && (
                <div>
                  <div className="text-fg-3 text-[12px] uppercase tracking-wide mb-1">Per agent</div>
                  {p.agents.map((a) => (
                    <div key={a.name} className="flex gap-2 py-1 border-b border-line last:border-0">
                      <span className="w-20 shrink-0 font-medium">{a.name}</span>
                      <span className="text-fg-2">
                        per purchase {fmt(a.perTransaction)} · month {fmt(a.monthly)} · {a.categories.length ? a.categories.join(", ") : "any category"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {p.alwaysAsk.length > 0 && <Row k="Always ask" v={list(p.alwaysAsk)} tone="wait" />}
              {p.rationale.length > 0 && (
                <div>
                  <div className="text-fg-3 text-[12px] uppercase tracking-wide mb-1">How each sentence was read</div>
                  <ul className="space-y-1 text-[12.5px] text-fg-2">
                    {p.rationale.map((r, i) => (
                      <li key={i} className="border-l border-line pl-2">{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ k, v, tone }: { k: string; v: string; tone?: "deny" | "wait" }) {
  return (
    <div className="flex gap-3">
      <span className="w-40 shrink-0 text-fg-3">{k}</span>
      <span className={tone === "deny" ? "text-deny" : tone === "wait" ? "text-wait" : ""}>{v}</span>
    </div>
  );
}
