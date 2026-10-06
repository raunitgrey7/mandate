"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { ownerHeaders } from "@/lib/client";
import { Send } from "lucide-react";

const suggestions = [
  "What is waiting for my approval, and should I say yes?",
  "List the last 5 PayPal transactions on this account.",
  "Refund the most recent grocery purchase.",
  "Create and send a $45 invoice to priya@example.com for dog walking this week.",
  "Are there any open disputes?",
];

export default function Copilot() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/copilot", headers: ownerHeaders() }),
  });
  const ready = status === "ready";
  const send = (text: string) => {
    if (!text.trim() || !ready) return;
    void sendMessage({ text });
    setInput("");
  };
  return (
    <>
      <PageHeader kicker="Copilot" title={<>Talk to your PayPal account</>} />
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <Card className="flex flex-col min-h-[70vh]">
          <div className="flex-1 space-y-4 overflow-auto scroll-thin pr-1">
            {messages.length === 0 && (
              <div className="text-[13px] text-fg-3 py-10 text-center">
                Ask about approvals, refunds, invoices, disputes, tracking or transactions. The PayPal side runs on the official PayPal Agent Toolkit.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`fade-up ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block max-w-[90%] text-left rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${m.role === "user" ? "bg-accent-2/20 border border-accent/30" : "bg-bg-2 border border-line"}`}>
                  {m.parts.map((p, i) => {
                    if (p.type === "text") return <p key={i} className="whitespace-pre-wrap">{p.text}</p>;
                    if (p.type.startsWith("tool-")) {
                      const t = p as unknown as { type: string; state: string; input?: unknown; output?: unknown };
                      return (
                        <div key={i} className="my-1.5 text-[12px]">
                          <span className="pill pill-info mr-2">{t.type.replace("tool-", "")}</span>
                          <span className="text-fg-3">{t.state === "output-available" ? "done" : "running…"}</span>
                          {t.output !== undefined && <pre className="num text-[11px] text-fg-2 mt-1 max-h-40 overflow-auto scroll-thin whitespace-pre-wrap">{JSON.stringify(t.output, null, 1).slice(0, 1500)}</pre>}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))}
            {error && <div className="text-[13px] text-deny">{error.message}</div>}
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input className="input" placeholder={ready ? "Ask or instruct…" : "Working…"} value={input} onChange={(e) => setInput(e.target.value)} disabled={!ready} />
            <button className="btn btn-primary" type="submit" disabled={!ready || !input.trim()}>
              <Send size={14} />
            </button>
          </form>
        </Card>
        <Card title="Try">
          <div className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <button key={s} className="btn justify-start text-left font-normal" onClick={() => send(s)} disabled={!ready}>
                {s}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-fg-3 mt-4 leading-relaxed">
            Tools available: Mandate (overview, list requests, approve/deny, refund) plus PayPal Agent Toolkit (orders, refunds, invoices, disputes, shipment tracking, catalog, subscriptions, transaction search). Sandbox only.
          </p>
        </Card>
      </div>
    </>
  );
}
