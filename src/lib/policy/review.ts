import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, aiConfigured } from "@/lib/ai/model";
import { CATEGORIES, type Policy } from "./schema";
import type { LlmReview, IntentItem } from "@/lib/db/schema";

const ReviewSchema = z.object({
  category: z.enum(CATEGORIES).describe("The true category of what is being bought, judged from the items, not the agent's label."),
  risk: z.number().min(0).max(100).describe("0 = clearly routine and within the mandate's spirit, 100 = almost certainly something the owner would not want."),
  flags: z.array(z.string()).describe("Short, specific concerns: label mismatch, odd quantity, suspicious merchant, reason does not match items, matches an alwaysAsk situation."),
  escalate: z.boolean().describe("true if a careful human assistant would check with the owner before paying, even if the numeric rules pass."),
  rationale: z.string().describe("One or two sentences the owner will read on their approval screen."),
});

export type ReviewInput = {
  agentName: string;
  agentRole: string;
  kind: "purchase" | "payout";
  merchant: string;
  recipientEmail?: string | null;
  items: IntentItem[];
  amountCents: number;
  category: string;
  recurring: boolean;
  reason: string;
};

/**
 * Semantic review of a purchase intent. The engine owns the numbers; this
 * layer owns meaning: is "groceries" actually whisky, does the reason fit the
 * cart, does the mandate's prose say to ask in this situation. It can only
 * escalate or re-categorise, never approve past a rule.
 */
export async function reviewIntent(policy: Policy, mandateText: string, input: ReviewInput): Promise<{ review: LlmReview; reviewer: "llm" | "heuristic" }> {
  if (!aiConfigured()) return { review: heuristicReview(policy, input), reviewer: "heuristic" };
  const model = await getModel();
  const { output } = await generateText({
    model,
    output: Output.object({ schema: ReviewSchema }),
    temperature: 0,
    system: `You are the trust layer between a person's PayPal wallet and the AI agents allowed to spend from it. You read each purchase request and decide whether it matches what the owner actually wrote. You are precise, sceptical and brief. Numeric limits are enforced elsewhere; focus on meaning, intent and anything the owner would want to know before money moves.`,
    prompt: `OWNER'S MANDATE (verbatim):\n"""\n${mandateText}\n"""\n\nCOMPILED POLICY (for reference): ${JSON.stringify(policy)}\n\nREQUEST from agent "${input.agentName}" (${input.agentRole || "no role given"}):\n${JSON.stringify(
      {
        kind: input.kind,
        merchant: input.merchant,
        recipient: input.recipientEmail ?? undefined,
        items: input.items.map((i) => ({ name: i.name, qty: i.quantity, unit: `$${(i.unitCents / 100).toFixed(2)}` })),
        total: `$${(input.amountCents / 100).toFixed(2)}`,
        agent_claimed_category: input.category,
        recurring: input.recurring,
        agent_reason: input.reason,
      },
      null,
      2,
    )}\n\nReturn your review.`,
  });
  return { review: { ...output, risk: Math.round(output.risk) }, reviewer: "llm" };
}

export function heuristicReview(policy: Policy, input: ReviewInput): LlmReview {
  const text = `${input.merchant} ${input.items.map((i) => i.name).join(" ")} ${input.reason}`.toLowerCase();
  const flags: string[] = [];
  let category = input.category;
  const hints: Record<string, RegExp> = {
    alcohol: /whisk|vodka|wine|beer|rum|gin\b|tequila|bourbon|champagne/,
    gambling: /casino|bet|lottery|poker/,
    tobacco: /cigar|tobacco|vape/,
    travel: /flight|train|hotel|ticket|airline|rail/,
    groceries: /grocer|milk|eggs|bread|produce|vegetable/,
    software: /saas|software|licen[cs]e|api credits|subscription/,
  };
  for (const [cat, re] of Object.entries(hints)) {
    if (re.test(text) && cat !== category) {
      flags.push(`Items look like "${cat}" but the agent labelled them "${category}".`);
      category = cat;
      break;
    }
  }
  const blocked = policy.categories.blocked.some((b) => category.includes(b.toLowerCase()));
  const risk = blocked ? 95 : flags.length ? 60 : input.amountCents > 20000 ? 40 : 10;
  return {
    category,
    risk,
    flags,
    escalate: risk >= 60,
    rationale: blocked ? `This looks like ${category}, which the mandate blocks.` : flags[0] ?? "Routine request consistent with the mandate.",
  };
}
