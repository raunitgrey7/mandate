import { env } from "@/lib/env";

/**
 * Minimal PayPal REST client with OAuth token caching. We talk to the REST
 * surface directly for the vault / orders / payouts flows that need exact
 * control over headers (PayPal-Request-Id) and response shapes.
 */
let cached: { token: string; expiresAt: number } | null = null;

export class PayPalError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function getAccessToken(): Promise<string> {
  if (!env.paypal.configured) {
    throw new PayPalError("PayPal sandbox credentials are not configured", 0, null);
  }
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${env.paypal.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new PayPalError(json.error_description ?? "PayPal OAuth failed", res.status, json);
  }
  cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export type PayPalRequest = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  requestId?: string;
  headers?: Record<string, string>;
};

export async function paypal<T = unknown>({ method, path, body, requestId, headers }: PayPalRequest): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${env.paypal.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const j = json as { message?: string; details?: { issue?: string; description?: string }[]; name?: string } | null;
    const detail = j?.details?.map((d) => `${d.issue ?? ""} ${d.description ?? ""}`.trim()).join("; ");
    throw new PayPalError(`${j?.name ?? "PAYPAL_ERROR"}: ${j?.message ?? res.statusText}${detail ? ` (${detail})` : ""}`, res.status, json);
  }
  return json as T;
}

export const toMoney = (cents: number) => (cents / 100).toFixed(2);
