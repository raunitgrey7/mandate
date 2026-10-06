"use client";

import type { ReactNode } from "react";
import type { Intent } from "@/lib/db/schema";
import { money, statusMeta, ago } from "@/lib/client";

export function PageHeader({ title, kicker, children }: { title: ReactNode; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        {kicker && <div className="text-[12px] uppercase tracking-[0.12em] text-fg-3 mb-1.5">{kicker}</div>}
        <h1 className="display text-[34px] md:text-[40px] leading-[1.05]">{title}</h1>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-[13px] font-semibold tracking-wide text-fg-2 uppercase">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ status }: { status: string }) {
  const m = statusMeta[status] ?? { label: status, cls: "pill-muted" };
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "paid" | "wait" | "deny" | "accent" }) {
  const color = tone === "paid" ? "text-paid" : tone === "wait" ? "text-wait" : tone === "deny" ? "text-deny" : tone === "accent" ? "text-accent" : "text-fg";
  return (
    <div className="card p-4">
      <div className="text-[12px] text-fg-3 uppercase tracking-wide">{label}</div>
      <div className={`num text-[26px] leading-tight mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[12px] text-fg-2 mt-1">{sub}</div>}
    </div>
  );
}

export function Meter({ used, cap, label }: { used: number; cap: number | null; label: string }) {
  const pct = cap ? Math.min(100, Math.round((used / (cap * 100)) * 100)) : 0;
  const tone = pct >= 100 ? "bg-deny" : pct >= 80 ? "bg-wait" : "bg-paid";
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1.5">
        <span className="text-fg-2">{label}</span>
        <span className="num text-fg">
          {money(used)} {cap !== null && <span className="text-fg-3">/ {money(cap * 100)}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-2 border border-line overflow-hidden">
        <div className={`h-full ${tone} transition-all duration-500`} style={{ width: `${cap ? pct : 0}%` }} />
      </div>
    </div>
  );
}

export function AgentDot({ color, name }: { color: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

export function IntentRow({ intent, agent, onClick }: { intent: Intent; agent?: { name: string; color: string }; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left flex items-center gap-3 py-2.5 border-b border-line last:border-0 hover:bg-surface-2/60 px-2 -mx-2 rounded-lg transition-colors">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: agent?.color ?? "#888" }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] truncate">
          <span className="text-fg-2">{agent?.name ?? "Agent"}</span> <span className="text-fg-3">·</span> {intent.kind === "payout" ? `Pay ${intent.merchant}` : intent.merchant}
        </div>
        <div className="text-[12px] text-fg-3 truncate">{intent.decision?.summary ?? intent.reason}</div>
      </div>
      <div className="num text-[13.5px] shrink-0">{money(intent.amountCents, intent.currency)}</div>
      <Pill status={intent.status} />
      <span className="text-[11px] text-fg-3 w-14 text-right shrink-0">{ago(intent.createdAt)}</span>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-[13px] text-fg-3 py-8 text-center">{children}</div>;
}
