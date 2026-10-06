import { tool, type Tool } from "ai";
import { z } from "zod";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { env } from "@/lib/env";
import { decideIntent, refundIntent } from "@/lib/intents";
import { listIntents, listAgents, getActiveMandate, spendUsage } from "@/lib/store";
import { presentIntent } from "@/lib/agent-tools";

type LegacyTool = { description?: string; parameters: z.ZodTypeAny; execute?: (args: unknown, options?: unknown) => Promise<unknown> };

/**
 * Owner copilot tools = PayPal Agent Toolkit (official) + Mandate actions.
 * The toolkit targets AI SDK v4's tool shape (parameters), so we re-wrap each
 * tool for the current SDK. Sandbox is forced on; see context.sandbox.
 */
export function paypalToolkitTools(): Record<string, Tool> {
  if (!env.paypal.configured) return {};
  const toolkit = new PayPalAgentToolkit({
    clientId: env.paypal.clientId,
    clientSecret: env.paypal.clientSecret,
    configuration: {
      context: { sandbox: env.paypal.env === "sandbox" },
      actions: {
        orders: { create: true, get: true, capture: true },
        payments: { createRefund: true, getRefunds: true },
        invoices: { create: true, list: true, get: true, send: true, sendReminder: true, cancel: true, generateQRC: true, search: true },
        disputes: { list: true, get: true, create: true },
        shipment: { create: true, get: true, update: true },
        products: { create: true, list: true, show: true, update: true },
        subscriptionPlans: { create: true, list: true, show: true },
        subscriptions: { create: true, show: true, cancel: true, update: true },
        transactions: { list: true },
      },
    },
  });
  const legacy = toolkit.getTools() as unknown as Record<string, LegacyTool>;
  const out: Record<string, Tool> = {};
  for (const [name, t] of Object.entries(legacy)) {
    out[`paypal_${name}`] = tool({
      description: t.description ?? name,
      inputSchema: t.parameters,
      execute: async (args: unknown) => {
        const r = await t.execute?.(args);
        return typeof r === "string" ? safeJson(r) : r;
      },
    } as never);
  }
  return out;
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function mandateTools(): Record<string, Tool> {
  return {
    mandate_overview: tool({
      description: "Current mandate text, budgets used this month, agents and pending approvals.",
      inputSchema: z.object({}),
      execute: async () => {
        const [mandate, agents, intents] = await Promise.all([getActiveMandate(), listAgents(), listIntents(100)]);
        const usage = await spendUsage(agents);
        return {
          mandate: mandate?.sourceText,
          policy: mandate?.policy,
          usage,
          agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role })),
          pending: intents.filter((i) => i.status === "needs_human").map(presentIntent),
        };
      },
    }),
    list_requests: tool({
      description: "Recent agent requests with status, PayPal ids and decision reasons.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20), status: z.string().optional() }),
      execute: async ({ limit, status }) => {
        const all = await listIntents(200);
        const agents = await listAgents();
        return all
          .filter((i) => !status || i.status === status)
          .slice(0, limit)
          .map((i) => ({ ...presentIntent(i), agent: agents.find((a) => a.id === i.agentId)?.name, reason: i.reason, items: i.items }));
      },
    }),
    decide_request: tool({
      description: "Approve or deny a request that is waiting for the owner (status needs_human). Approving moves money via PayPal immediately.",
      inputSchema: z.object({ request_id: z.string(), approve: z.boolean(), note: z.string().optional() }),
      execute: async ({ request_id, approve, note }) => presentIntent(await decideIntent(request_id, approve, "owner-copilot", note ?? "")),
    }),
    refund_request: tool({
      description: "Refund a paid purchase through PayPal (full refund of the capture).",
      inputSchema: z.object({ request_id: z.string(), note: z.string().optional() }),
      execute: async ({ request_id, note }) => presentIntent(await refundIntent(request_id, note ?? "Refunded via copilot")),
    }),
  };
}
