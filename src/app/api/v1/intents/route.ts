import { z } from "zod";
import { body, handle, json, requireAgent } from "@/lib/http";
import { PayoutInput, PurchaseInput, toolListRequests, toolRequestPayout, toolRequestPurchase } from "@/lib/agent-tools";

export const maxDuration = 60;

const Body = z.discriminatedUnion("kind", [
  PurchaseInput.extend({ kind: z.literal("purchase") }),
  PayoutInput.extend({ kind: z.literal("payout") }),
]);

/** REST equivalent of the MCP tools, for agents that speak plain HTTP. */
export async function POST(req: Request) {
  return handle(async () => {
    const agent = await requireAgent(req);
    const parsed = Body.safeParse(await body(req));
    if (!parsed.success) return json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
    const result = parsed.data.kind === "purchase" ? await toolRequestPurchase(agent, parsed.data) : await toolRequestPayout(agent, parsed.data);
    return json(result, { status: 201 });
  });
}

export async function GET(req: Request) {
  return handle(async () => {
    const agent = await requireAgent(req);
    return json({ requests: await toolListRequests(agent, 50) });
  });
}
