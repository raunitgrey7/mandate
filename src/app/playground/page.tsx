"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, useActivity } from "@/lib/client";
import { Card, PageHeader, Pill } from "@/components/ui";
import type { PlaygroundEvent, Scenario } from "@/lib/playground";
import { Play, RotateCcw } from "lucide-react";

type Line = { id: number; e: PlaygroundEvent };

export default function Playground() {
  const { data, reload } = useActivity(2000);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [aiOk, setAiOk] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const counter = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ scenarios: Scenario[]; ai: boolean }>("/api/playground").then((r) => {
      setScenarios(r.scenarios);
      setAiOk(r.ai);
      setPicked(r.scenarios.map((s) => s.key));
    });
  }, []);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [lines]);

  const run = async () => {
    setRunning(true);
    setLines([]);
    const res = await fetch("/api/playground", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: picked }) });
    if (!res.body) return setRunning(false);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const p of parts) {
        if (!p.trim()) continue;
        try {
          const e = JSON.parse(p) as PlaygroundEvent;
          setLines((ls) => [...ls, { id: counter.current++, e }]);
          if (e.type === "tool.result" || e.type === "agent.done") void reload();
        } catch {
          /* ignore partial */
        }
      }
    }
    setRunning(false);
    void reload();
  };
  const reset = async () => {
    await api("/api/demo/reset", { method: "POST" });
    setLines([]);
    await reload();
  };
  const agentColor = (name: string) => data?.agents.find((a) => a.name === name)?.color ?? "#888";
  const linked = data?.wallet.status === "linked";
  return (
    <>
      <PageHeader kicker="Playground" title={<>Four agents, one wallet, <em className="italic">live</em></>}>
        <button className="btn" onClick={reset} disabled={running}>
          <RotateCcw size={14} /> Reset demo
        </button>
        <button className="btn btn-primary" onClick={run} disabled={running || picked.length === 0 || !aiOk}>
          <Play size={14} /> {running ? "Agents running…" : "Run selected agents"}
        </button>
      </PageHeader>
      {!linked && (
        <div className="card border-wait/40 p-3 mb-4 text-[13px] text-wait">
          The wallet is not linked, so purchases will fail at PayPal. <Link href="/wallet" className="underline">Link it first</Link> (payouts still work).
        </div>
      )}
      {!aiOk && <div className="card border-deny/40 p-3 mb-4 text-[13px] text-deny">No AI provider configured; the in-app agents need a model. See README.</div>}
      <div className="grid lg:grid-cols-[1fr_1.6fr] gap-4">
        <div className="space-y-3">
          {scenarios.map((s) => {
            const on = picked.includes(s.key);
            return (
              <button key={s.key} onClick={() => setPicked((p) => (on ? p.filter((k) => k !== s.key) : [...p, s.key]))} className={`card w-full text-left p-4 transition-colors ${on ? "border-accent/50" : "opacity-60"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: agentColor(s.agent) }} />
                  <span className="text-[14px] font-medium">{s.agent}</span>
                  <span className="text-fg-3 text-[13px]">· {s.title}</span>
                  <span className="ml-auto">
                    <Pill status={s.expected === "paid" ? "paid" : s.expected} />
                  </span>
                </div>
                <div className="text-[12.5px] text-fg-2 leading-relaxed">{s.brief}</div>
              </button>
            );
          })}
          <p className="text-[12px] text-fg-3 leading-relaxed px-1">
            These are real LLM agents with the same tools an external MCP client gets. Expected outcomes are what the active mandate implies; change the mandate and they change too.
          </p>
        </div>
        <Card title="Live transcript" className="min-h-[420px]">
          <div className="space-y-2 max-h-[70vh] overflow-auto scroll-thin pr-1">
            {lines.length === 0 && <div className="text-[13px] text-fg-3 py-10 text-center">Press Run. Each agent reads its mandate, makes one request, and reports back.</div>}
            {lines.map(({ id, e }) => (
              <Line key={id} e={e} color={agentColor(e.agent)} />
            ))}
            <div ref={bottom} />
          </div>
        </Card>
      </div>
    </>
  );
}

function Line({ e, color }: { e: PlaygroundEvent; color: string }) {
  const head = (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-3 w-16 shrink-0">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {e.agent}
    </span>
  );
  if (e.type === "agent.start") return <div className="fade-up flex gap-2 text-[13px]">{head}<span className="text-fg-3">woke up</span></div>;
  if (e.type === "text") return <div className="fade-up flex gap-2 text-[13px]">{head}<span className="text-fg-2 italic">{e.text}</span></div>;
  if (e.type === "tool.call")
    return (
      <div className="fade-up flex gap-2 text-[13px]">
        {head}
        <span>
          <span className="pill pill-info mr-2">{e.name}</span>
          <span className="num text-[12px] text-fg-2 break-all">{JSON.stringify(e.args)}</span>
        </span>
      </div>
    );
  if (e.type === "tool.result") {
    const r = e.result as { status?: string; amount?: string; decision?: string; paypal?: { capture_id?: string; payout_batch_id?: string }; rules?: string[] };
    return (
      <div className="fade-up flex gap-2 text-[13px]">
        {head}
        <span className="card bg-bg-2 p-2.5 flex-1">
          {r?.status ? (
            <>
              <div className="flex items-center gap-2">
                <Pill status={r.status} />
                <span className="num">{r.amount}</span>
                {r.paypal?.capture_id && <span className="num text-[11px] text-fg-3">capture {r.paypal.capture_id}</span>}
                {r.paypal?.payout_batch_id && <span className="num text-[11px] text-fg-3">payout {r.paypal.payout_batch_id}</span>}
              </div>
              {r.decision && <div className="text-[12.5px] text-fg-2 mt-1">{r.decision}</div>}
            </>
          ) : (
            <span className="num text-[11.5px] text-fg-2 break-all">{JSON.stringify(e.result).slice(0, 400)}</span>
          )}
        </span>
      </div>
    );
  }
  if (e.type === "agent.done") return <div className="fade-up flex gap-2 text-[13px]">{head}<span className="text-fg">{e.text} <span className="text-fg-3 num text-[11px]">{(e.ms / 1000).toFixed(1)}s</span></span></div>;
  return <div className="fade-up flex gap-2 text-[13px]">{head}<span className="text-deny">{e.message}</span></div>;
}
