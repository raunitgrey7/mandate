import { body, handle, json } from "@/lib/http";
import { getWallet, listAgents } from "@/lib/store";
import { runScenario, scenarios, type PlaygroundEvent } from "@/lib/playground";
import { aiConfigured } from "@/lib/ai/model";

export const maxDuration = 120;

/** Streams newline-delimited JSON events while the demo agents run. */
export async function POST(req: Request) {
  return handle(async () => {
    if (!aiConfigured()) return json({ error: "No AI provider configured" }, { status: 503 });
    const { keys } = await body<{ keys?: string[] }>(req).catch(() => ({ keys: undefined }));
    await getWallet();
    const agents = await listAgents();
    const payoutEmail = process.env.PAYOUT_DEMO_EMAIL ?? process.env.PAYPAL_BUYER_EMAIL ?? "priya@example.com";
    const all = scenarios(payoutEmail);
    const selected = keys?.length ? all.filter((s) => keys.includes(s.key)) : all;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (e: PlaygroundEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        await Promise.all(
          selected.map(async (s) => {
            const agent = agents.find((a) => a.name.toLowerCase() === s.agent.toLowerCase() && !a.revoked);
            if (!agent) return emit({ type: "error", scenario: s.key, agent: s.agent, message: `No agent named ${s.agent}` });
            await runScenario(agent, s, emit);
          }),
        );
        controller.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
  });
}

export async function GET() {
  const payoutEmail = process.env.PAYOUT_DEMO_EMAIL ?? process.env.PAYPAL_BUYER_EMAIL ?? "priya@example.com";
  return json({ scenarios: scenarios(payoutEmail), ai: aiConfigured() });
}
