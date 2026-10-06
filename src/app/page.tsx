"use client";

import Link from "next/link";
import { useState } from "react";
import { useActivity, money } from "@/lib/client";
import { Card, Empty, IntentRow, Meter, PageHeader, Stat } from "@/components/ui";
import { IntentDetail } from "@/components/intent-detail";
import { ArrowRight } from "lucide-react";

export default function Overview() {
  const { data, reload } = useActivity(3000);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <div className="text-fg-3 text-sm">Loading…</div>;
  const agentsById = Object.fromEntries(data.agents.map((a) => [a.id, a]));
  const p = data.mandate?.policy;
  const paid = data.intents.filter((i) => i.status === "paid");
  const denied = data.intents.filter((i) => i.status === "denied");
  const selected = data.intents.find((i) => i.id === open);
  const today = new Date();
  const monthName = today.toLocaleString("en-US", { month: "long" });
  return (
    <>
      <PageHeader kicker="Household wallet" title={<>Agents spending inside <em className="italic">your</em> rules</>}>
        {data.wallet.status !== "linked" && (
          <Link href="/wallet" className="btn btn-primary">
            Link PayPal wallet <ArrowRight size={14} />
          </Link>
        )}
        <Link href="/playground" className="btn">
          Run the agents
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label={`Spent in ${monthName}`} value={money(data.usage.month)} sub={p?.limits.monthly != null ? `of ${money(p.limits.monthly * 100)} budget` : "no monthly cap"} />
        <Stat label="Awaiting you" value={data.pending.length} sub={data.pending.length ? money(data.pending.reduce((s, i) => s + i.amountCents, 0)) + " on hold" : "inbox clear"} tone={data.pending.length ? "wait" : undefined} />
        <Stat label="Paid via PayPal" value={paid.length} sub={`${money(paid.reduce((s, i) => s + i.amountCents, 0))} moved`} tone="paid" />
        <Stat label="Blocked" value={denied.length} sub={denied.length ? `${money(denied.reduce((s, i) => s + i.amountCents, 0))} never left the wallet` : "nothing denied yet"} tone={denied.length ? "deny" : undefined} />
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <div className="space-y-4">
          <Card title="Activity" action={<Link href="/ledger" className="text-[12px] text-accent">Full ledger →</Link>}>
            {data.intents.length === 0 ? (
              <Empty>
                No requests yet. <Link className="text-accent" href="/playground">Run the demo agents</Link> or connect your own over MCP.
              </Empty>
            ) : (
              data.intents.slice(0, 12).map((i) => <IntentRow key={i.id} intent={i} agent={agentsById[i.agentId]} onClick={() => setOpen(i.id)} />)
            )}
          </Card>
          {selected && (
            <Card>
              <IntentDetail intent={selected} agent={agentsById[selected.agentId]} onChange={reload} onClose={() => setOpen(null)} />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card title="Budgets">
            <div className="space-y-3">
              <Meter label="This month, all agents" used={data.usage.month} cap={p?.limits.monthly ?? null} />
              {p?.limits.weekly != null && <Meter label="This week" used={data.usage.week} cap={p.limits.weekly} />}
              {p?.limits.daily != null && <Meter label="Today" used={data.usage.day} cap={p.limits.daily} />}
              {p?.payouts.enabled && <Meter label="Payouts this month" used={data.usage.payoutMonth} cap={p.payouts.monthly} />}
              {p?.agents.filter((a) => a.monthly != null).map((a) => (
                <Meter key={a.name} label={`${a.name} this month`} used={data.usage.agentMonth[a.name.toLowerCase()] ?? 0} cap={a.monthly} />
              ))}
            </div>
          </Card>
          <Card title="Mandate" action={<Link href="/mandate" className="text-[12px] text-accent">Edit →</Link>}>
            <p className="text-[13px] text-fg-2 whitespace-pre-line leading-relaxed">{data.mandate?.sourceText}</p>
            <div className="mt-3 text-[11px] text-fg-3">
              v{data.mandate?.version} · compiled by {data.mandate?.compiledBy} · {p?.categories.blocked.length ?? 0} blocked categories · auto-approve up to {p?.approvalAbove != null ? money(p.approvalAbove * 100) : "any amount"}
            </div>
          </Card>
          <Card title="Agents" action={<Link href="/agents" className="text-[12px] text-accent">Manage →</Link>}>
            <div className="space-y-2">
              {data.agents.map((a) => {
                const spent = data.intents.filter((i) => i.agentId === a.id && i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
                return (
                  <div key={a.id} className="flex items-center gap-2.5 text-[13px]">
                    <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
                    <span className={a.revoked ? "line-through text-fg-3" : ""}>{a.name}</span>
                    <span className="text-fg-3 truncate flex-1">{a.role}</span>
                    <span className="num text-fg-2">{money(spent)}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
