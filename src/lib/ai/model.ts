import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

/**
 * Model selection, in priority order:
 *   1. ANTHROPIC_API_KEY          -> Claude directly
 *   2. GOOGLE_GENERATIVE_AI_API_KEY -> Gemini directly
 *   3. AI_GATEWAY_API_KEY, or AI_PROVIDER=gateway with Vercel OIDC -> Vercel AI Gateway
 * AI_MODEL overrides the model id for whichever provider is active.
 */
export function modelInfo(): { provider: "anthropic" | "google" | "gateway" | "none"; id: string } {
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", id: env.ai.model || "claude-sonnet-4-5" };
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { provider: "google", id: env.ai.model || "gemini-2.5-flash" };
  if (process.env.AI_GATEWAY_API_KEY || process.env.AI_PROVIDER === "gateway") {
    return { provider: "gateway", id: env.ai.model || "anthropic/claude-sonnet-4.5" };
  }
  return { provider: "none", id: "" };
}

export async function getModel(): Promise<LanguageModel> {
  const info = modelInfo();
  switch (info.provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(info.id);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(info.id);
    }
    case "gateway":
      return info.id; // plain provider/model strings route through Vercel AI Gateway
    default:
      throw new Error(
        "No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY.",
      );
  }
}

export const aiConfigured = () => modelInfo().provider !== "none";
