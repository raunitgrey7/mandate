import { convertToModelMessages, createUIMessageStreamResponse, stepCountIs, streamText, toUIMessageStream, type UIMessage } from "ai";
import { getModel, aiConfigured } from "@/lib/ai/model";
import { mandateTools, paypalToolkitTools } from "@/lib/copilot-tools";
import { getWallet } from "@/lib/store";
import { requireOwner, json } from "@/lib/http";

export const maxDuration = 120;

/**
 * Owner copilot: a chat over the household's PayPal account and Mandate state,
 * using the official PayPal Agent Toolkit for the PayPal side (orders,
 * refunds, invoices, disputes, tracking, subscriptions, transactions).
 */
export async function POST(req: Request) {
  requireOwner(req);
  if (!aiConfigured()) return json({ error: "No AI provider configured" }, { status: 503 });
  const { messages }: { messages: UIMessage[] } = await req.json();
  await getWallet();
  const model = await getModel();
  const result = streamText({
    model,
    tools: { ...mandateTools(), ...paypalToolkitTools() },
    stopWhen: stepCountIs(8),
    system: `You are the owner's copilot inside Mandate, a governed PayPal wallet for AI agents. The account is a PayPal SANDBOX.
You can inspect and act on the household's Mandate state (requests, approvals, refunds) and on the PayPal account itself through the PayPal Agent Toolkit tools (orders, refunds, invoices, disputes, shipment tracking, subscriptions, transaction reports).
Be concise and concrete: amounts, ids, dates. When asked to approve, deny or refund, do it and confirm with the PayPal id. If a PayPal tool errors, quote the error briefly and suggest the next step. Never invent data.`,
    messages: await convertToModelMessages(messages),
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
