import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { agentFromApiKey } from "@/lib/store";
import { PayoutInput, PurchaseInput, toolGetMandate, toolGetStatus, toolListRequests, toolRequestPayout, toolRequestPurchase } from "@/lib/agent-tools";
import type { Agent } from "@/lib/db/schema";

export const maxDuration = 60;

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

/**
 * Mandate's MCP server. Any MCP client (Claude Desktop, Cursor, an OpenAI agent,
 * a LangGraph graph) connects with its agent API key as a bearer token and gets
 * a wallet it can spend from, inside the owner's mandate.
 */
function buildHandler(agent: Agent) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "get_mandate",
        {
          title: "Get my spending mandate",
          description: "Returns what this agent is allowed to buy, its limits and remaining budget. Call this before your first purchase.",
          inputSchema: z.object({}),
        },
        async () => text(await toolGetMandate(agent)),
      );
      server.registerTool(
        "request_purchase",
        {
          title: "Request a purchase",
          description:
            "Ask Mandate to pay a merchant from the owner's PayPal wallet. Returns status: paid (money moved, PayPal ids included), needs_human (owner must approve; poll get_request_status), or denied (do not retry).",
          inputSchema: PurchaseInput,
        },
        async (input) => text(await toolRequestPurchase(agent, input)),
      );
      server.registerTool(
        "request_payout",
        {
          title: "Pay a person",
          description: "Send money to a person's PayPal email (contractor, helper) via PayPal Payouts, if the mandate allows payouts to them.",
          inputSchema: PayoutInput,
        },
        async (input) => text(await toolRequestPayout(agent, input)),
      );
      server.registerTool(
        "get_request_status",
        {
          title: "Check a request",
          description: "Current status of a purchase or payout request, including the owner's decision and PayPal identifiers.",
          inputSchema: z.object({ request_id: z.string() }),
        },
        async ({ request_id }) => text(await toolGetStatus(agent, request_id)),
      );
      server.registerTool(
        "list_my_requests",
        {
          title: "List my requests",
          description: "Recent requests made by this agent.",
          inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
        },
        async ({ limit }) => text(await toolListRequests(agent, limit)),
      );
    },
    { serverInfo: { name: "mandate", version: "1.0.0" } },
  );
}

async function withAgent(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key");
  const agent = await agentFromApiKey(key);
  if (!agent) {
    return new Response(JSON.stringify({ error: "Connect with an agent API key: Authorization: Bearer mk_live_..." }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="mandate"' },
    });
  }
  return buildHandler(agent)(req);
}

export { withAgent as GET, withAgent as POST, withAgent as DELETE };
