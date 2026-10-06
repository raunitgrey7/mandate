import { NextResponse } from "next/server";
import { agentFromApiKey } from "@/lib/store";
import { env } from "@/lib/env";
import type { Agent } from "@/lib/db/schema";

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e) => {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);
    if (status === 500) console.error(e);
    return json({ error: message }, { status });
  });
}

/** Agent authentication: `Authorization: Bearer mk_live_...` or `x-api-key`. */
export async function requireAgent(req: Request): Promise<Agent> {
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : req.headers.get("x-api-key");
  const agent = await agentFromApiKey(key);
  if (!agent) throw new HttpError(401, "Invalid or missing agent API key");
  return agent;
}

/** Owner actions are guarded by OWNER_PIN when it is set (header x-owner-pin). */
export function requireOwner(req: Request) {
  if (!env.app.ownerPin) return;
  if (req.headers.get("x-owner-pin") !== env.app.ownerPin) throw new HttpError(403, "Owner PIN required");
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
