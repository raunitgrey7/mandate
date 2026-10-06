import type { LanguageModel } from "ai";
import { env } from "@/lib/env";

/**
 * Model selection, in priority order:
 *   1. ANTHROPIC_API_KEY            -> Claude directly
 *   2. GOOGLE_GENERATIVE_AI_API_KEY -> Gemini directly
 *   3. AI_GATEWAY_API_KEY, or AI_PROVIDER=gateway with Vercel OIDC -> Vercel AI Gateway
 * AI_MODEL overrides the primary model id; AI_MODEL_FALLBACK names a second
 * model used when the primary is unavailable (free tiers throttle under load).
 */
export type ModelInfo = { provider: "anthropic" | "google" | "gateway" | "none"; id: string; fallback: string | null };

export function modelInfo(): ModelInfo {
  const fb = process.env.AI_MODEL_FALLBACK ?? null;
  if (process.env.ANTHROPIC_API_KEY) return { provider: "anthropic", id: env.ai.model || "claude-sonnet-4-5", fallback: fb ?? "claude-haiku-4-5" };
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return { provider: "google", id: env.ai.model || "gemini-3.8-flash", fallback: fb ?? "gemini-3.5-flash-lite" };
  if (process.env.AI_GATEWAY_API_KEY || process.env.AI_PROVIDER === "gateway") {
    return { provider: "gateway", id: env.ai.model || "anthropic/claude-sonnet-4.5", fallback: fb ?? "google/gemini-3.5-flash-lite" };
  }
  return { provider: "none", id: "", fallback: null };
}

async function build(provider: ModelInfo["provider"], id: string): Promise<LanguageModel> {
  switch (provider) {
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(id);
    }
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(id);
    }
    case "gateway":
      return id; // plain provider/model strings route through Vercel AI Gateway
    default:
      throw new Error("No AI provider configured. Set GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY or AI_GATEWAY_API_KEY.");
  }
}

export async function getModel(): Promise<LanguageModel> {
  const info = modelInfo();
  return build(info.provider, info.id);
}

/**
 * Runs `fn` with the primary model and, if the provider rejects the call
 * (capacity, rate limit, outage), once more with the fallback model.
 */
export async function withModel<T>(fn: (model: LanguageModel, id: string) => Promise<T>): Promise<T> {
  const info = modelInfo();
  const primary = await build(info.provider, info.id);
  try {
    return await fn(primary, info.id);
  } catch (e) {
    if (!info.fallback || info.fallback === info.id) throw e;
    console.warn(`[ai] ${info.id} failed (${e instanceof Error ? e.message.slice(0, 120) : e}); retrying with ${info.fallback}`);
    const fallback = await build(info.provider, info.fallback);
    return fn(fallback, info.fallback);
  }
}

export const aiConfigured = () => modelInfo().provider !== "none";
