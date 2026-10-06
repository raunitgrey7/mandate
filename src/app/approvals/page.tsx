"use client";

import { useActivity } from "@/lib/client";
import { Card, Empty, IntentRow, PageHeader } from "@/components/ui";
import { IntentDetail } from "@/components/intent-detail";
import { useState } from "react";

/**
 * The owner's inbox. Designed to work on a phone: this is the screen the
 * owner taps when an agent needs a yes.
 */
export default function Approvals() {
  const { data, reload } = useActivity(2000);
  const [open, setOpen] = useState<string | null>(null);
  if (!data) return <div className="text-fg-3 text-sm">Loading…</div>;
  const agentsById = Object.fromEntries(data.agents.map((a) => [a.id, a]));
  const decided = data.intents.filter((i) => ["approved", "denied", "paid", "refunded", "failed"].includes(i.status) && i.decidedBy && i.decidedBy !== "policy").slice(0, 10);
  const history = data.intents.find((i) => i.id === open);
  return (
    <>
      <PageHeader kicker="Approvals" title={data.pending.length ? <>{data.pending.length} request{data.pending.length > 1 ? "s" : ""} need{data.pending.length > 1 ? "" : "s"} a yes</> : "Inbox clear"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {data.pending.length === 0 && (
            <Card>
              <Empty>Nothing waiting. Agents inside the mandate pay on their own; only exceptions land here.</Empty>
            </Card>
          )}
          {data.pending.map((i) => (
            <Card key={i.id} className="border-wait/40 shadow-[0_0_0_1px_rgba(245,195,91,0.15)]">
              <IntentDetail intent={i} agent={agentsById[i.agentId]} onChange={reload} />
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Your recent decisions">
            {decided.length === 0 ? <Empty>No manual decisions yet.</Empty> : decided.map((i) => <IntentRow key={i.id} intent={i} agent={agentsById[i.agentId]} onClick={() => setOpen(i.id)} />)}
          </Card>
          {history && (
            <Card>
              <IntentDetail intent={history} agent={agentsById[history.agentId]} onChange={reload} onClose={() => setOpen(null)} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
