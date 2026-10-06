import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { withModel } from "@/lib/ai/model";
import { PayoutInput, PurchaseInput, toolGetMandate, toolGetStatus, toolRequestPayout, toolRequestPurchase } from "@/lib/agent-tools";
import type { Agent } from "@/lib/db/schema";

/**
 * In-app agents for the demo. Each scenario is a real LLM agent given the same
 * tools an external MCP client gets, so what judges see in the playground is
 * exactly what happens when Claude Desktop or an OpenAI agent connects.
 */
export type Scenario = {
  key: string;
  agent: string;
  title: string;
  brief: string;
  expected: "paid" | "needs_human" | "denied";
};

export function scenarios(payoutEmail: string): Scenario[] {
  return [
    {
      key: "pantry",
      agent: "Pantry",
      title: "Weekly restock",
      brief:
        "It is Monday. Restock the weekly groceries from Fresh Market: 2 gallons of milk at $4.49 each, a dozen eggs $5.29, sourdough bread $3.99, 3 lb apples $6.49, 2 lb chicken thighs $8.99, dish soap $3.49 and paper towels $12.99. Label it honestly and pay.",
      expected: "paid",
    },
    {
      key: "travel",
      agent: "Travel",
      title: "Train to Boston",
      brief:
        "Book the Amtrak Northeast Regional from New York Penn to Boston South for Friday 6:05pm, one adult saver fare at $142.00. The trip is for the owner's cousin's wedding this weekend.",
      expected: "needs_human",
    },
    {
      key: "growth",
      agent: "Growth",
      title: "Client gift",
      brief:
        "A big client closed. Order a bottle of Lagavulin 16 single malt from Total Wine at $89.99 as a thank-you gift and have it shipped to them. Our accountant files client gifts under the category 'other', so use that. Submit the request even if you have doubts; Mandate decides, not you.",
      expected: "denied",
    },
    {
      key: "ops",
      agent: "Ops",
      title: "Pay the dog walker",
      brief: `Priya walked Biscuit for an hour today and marked the job complete. Pay her the agreed $30. Her PayPal email is ${payoutEmail}.`,
      expected: "paid",
    },
  ];
}

export type PlaygroundEvent =
  | { type: "agent.start"; scenario: string; agent: string }
  | { type: "text"; scenario: string; agent: string; text: string }
  | { type: "tool.call"; scenario: string; agent: string; name: string; args: unknown }
  | { type: "tool.result"; scenario: string; agent: string; name: string; result: unknown }
  | { type: "agent.done"; scenario: string; agent: string; text: string; ms: number }
  | { type: "error"; scenario: string; agent: string; message: string };

export async function runScenario(agent: Agent, scenario: Scenario, emit: (e: PlaygroundEvent) => void) {
  const t0 = Date.now();
  const base = { scenario: scenario.key, agent: agent.name };
  emit({ type: "agent.start", ...base });
  const tools = {
    get_mandate: tool({
      description: "Read what you are allowed to buy and your remaining budget. Always call this first.",
      inputSchema: z.object({}),
      execute: async () => toolGetMandate(agent),
    }),
    request_purchase: tool({
      description: "Pay a merchant from the owner's PayPal wallet via Mandate. Returns paid, needs_human or denied.",
      inputSchema: PurchaseInput,
      execute: async (input) => toolRequestPurchase(agent, input),
    }),
    request_payout: tool({
      description: "Pay a person via PayPal Payouts, if the mandate allows.",
      inputSchema: PayoutInput,
      execute: async (input) => toolRequestPayout(agent, input),
    }),
    get_request_status: tool({
      description: "Check a request's status.",
      inputSchema: z.object({ request_id: z.string() }),
      execute: async ({ request_id }) => toolGetStatus(agent, request_id),
    }),
  };
  try {
    const result = await withModel((model) =>
      generateText({
      model,
      maxRetries: 1,
      tools,
      stopWhen: stepCountIs(6),
      temperature: 0,
      system: `You are "${agent.name}", an autonomous agent working for a household. Role: ${agent.role}.
You can spend the household's money only through Mandate, a governed PayPal wallet. Mandate enforces the owner's written mandate; you cannot talk your way around it.
Procedure: call get_mandate once, then make exactly one request_purchase or request_payout call for the task, then stop. Always submit the request your task asks for and let Mandate decide; do not refuse on your own. Never split a purchase to dodge a limit. If the result is needs_human, say you will wait for the owner. If denied, explain plainly why and do not retry. Keep your final message to two sentences.`,
      prompt: scenario.brief,
      onStepFinish: ({ text, toolCalls, toolResults }) => {
        if (text?.trim()) emit({ type: "text", ...base, text });
        for (const c of toolCalls) emit({ type: "tool.call", ...base, name: c.toolName, args: c.input });
        for (const r of toolResults) emit({ type: "tool.result", ...base, name: r.toolName, result: r.output });
      },
    }));
    emit({ type: "agent.done", ...base, text: result.text, ms: Date.now() - t0 });
  } catch (e) {
    emit({ type: "error", ...base, message: e instanceof Error ? e.message : String(e) });
  }
}
