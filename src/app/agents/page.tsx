"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { api, useActivity } from "@/lib/client";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";

type AgentRow = { id: string; name: string; role: string; color: string; revoked: boolean; apiKeyPrefix: string; apiKeyDemo?: string | null };

export default function AgentsPage() {
  const { reload } = useActivity(5000);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [created, setCreated] = useState<{ name: string; apiKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const load = async () => {
    const r = await api<{ agents: AgentRow[] }>("/api/v1/agents");
    setAgents(r.agents);
    setSelected((s) => s ?? r.agents.find((a) => !a.revoked) ?? null);
  };
  useEffect(() => {
    let on = true;
    api<{ agents: AgentRow[] }>("/api/v1/agents").then((r) => {
      if (!on) return;
      setAgents(r.agents);
      setSelected((s) => s ?? r.agents.find((a) => !a.revoked) ?? null);
    });
    return () => {
      on = false;
    };
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ agent: AgentRow; apiKey: string }>("/api/v1/agents", { method: "POST", body: JSON.stringify({ name, role }) });
      setCreated({ name: r.agent.name, apiKey: r.apiKey });
      setName("");
      setRole("");
      await load();
      await reload();
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (id: string) => {
    await api(`/api/v1/agents/${id}`, { method: "DELETE" });
    await load();
    await reload();
  };
  const key = selected?.apiKeyDemo ?? "mk_live_…";
  const mcpUrl = `${origin}/api/mcp`;
  return (
    <>
      <PageHeader kicker="Agents" title={<>Any agent, any framework, <em className="italic">one</em> wallet</>} />
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
        <div className="space-y-4">
          <Card title="Registered agents">
            {agents.length === 0 ? (
              <Empty>No agents yet.</Empty>
            ) : (
              agents.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)} className={`w-full text-left flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg border-b border-line last:border-0 transition-colors ${selected?.id === a.id ? "bg-surface-2/70" : "hover:bg-surface-2/40"}`}>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />
                  <div className="min-w-0 flex-1">
                    <div className={`text-[14px] ${a.revoked ? "line-through text-fg-3" : ""}`}>{a.name}</div>
                    <div className="text-[12px] text-fg-3 truncate">{a.role}</div>
                  </div>
                  <span className="num text-[11px] text-fg-3">{a.apiKeyPrefix}…</span>
                  {!a.revoked && (
                    <span
                      role="button"
                      className="text-fg-3 hover:text-deny p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        void revoke(a.id);
                      }}
                      aria-label="Revoke"
                    >
                      <Trash2 size={14} />
                    </span>
                  )}
                </button>
              ))
            )}
          </Card>
          <Card title="Add an agent">
            <div className="flex flex-col gap-2">
              <input className="input" placeholder="Name, e.g. Tutor" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="input" placeholder="What it does (shown to the reviewer)" value={role} onChange={(e) => setRole(e.target.value)} />
              <button className="btn btn-primary self-start" disabled={busy || !name.trim()} onClick={create}>
                <Plus size={14} /> Issue API key
              </button>
            </div>
            {created && (
              <div className="mt-3 card bg-bg-2 p-3 text-[13px]">
                <div className="flex items-center gap-2 text-fg-2 mb-1">
                  <KeyRound size={13} /> Key for {created.name}
                </div>
                <code className="num text-[12px] break-all">{created.apiKey}</code>
              </div>
            )}
          </Card>
        </div>
        <Card title={selected ? `Connect ${selected.name}` : "Connect"}>
          <p className="text-[13.5px] text-fg-2 leading-relaxed mb-4">
            Each agent gets an API key, not your PayPal. Point any MCP client at Mandate&apos;s server, or call the REST API. Tools: <span className="num">get_mandate</span>, <span className="num">request_purchase</span>, <span className="num">request_payout</span>, <span className="num">get_request_status</span>, <span className="num">list_my_requests</span>.
          </p>
          <Snippet
            title="Claude Desktop / Cursor / any MCP client"
            code={`{
  "mcpServers": {
    "mandate": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${mcpUrl}",
               "--header", "Authorization: Bearer ${key}"]
    }
  }
}`}
          />
          <Snippet
            title="Claude Code"
            code={`claude mcp add --transport http mandate ${mcpUrl} \\
  --header "Authorization: Bearer ${key}"`}
          />
          <Snippet
            title="REST (curl)"
            code={`curl -X POST ${origin}/api/v1/intents \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"kind":"purchase","merchant":"Fresh Market","category":"groceries",
       "reason":"Weekly restock","items":[{"name":"Milk","quantity":2,"unit_price":4.49}]}'`}
          />
          <Snippet
            title="Vercel AI SDK (TypeScript)"
            code={`import { experimental_createMCPClient as createMCPClient } from "ai";
const mcp = await createMCPClient({
  transport: { type: "http", url: "${mcpUrl}",
    headers: { Authorization: "Bearer ${key}" } },
});
const tools = await mcp.tools(); // get_mandate, request_purchase, ...`}
          />
        </Card>
      </div>
    </>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[12px] text-fg-3 mb-1">
        <span>{title}</span>
        <button
          className="inline-flex items-center gap-1 hover:text-fg"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <Copy size={12} /> {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="num text-[11.5px] leading-relaxed bg-bg-2 border border-line rounded-lg p-3 overflow-auto scroll-thin">{code}</pre>
    </div>
  );
}
