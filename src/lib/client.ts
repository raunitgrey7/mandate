"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, Intent, LedgerEvent, Mandate, Wallet, WebhookEvent } from "@/lib/db/schema";
import type { SpendUsage } from "@/lib/policy/engine";

export type Activity = {
  wallet: Wallet;
  agents: Pick<Agent, "id" | "name" | "role" | "color" | "revoked" | "apiKeyPrefix">[];
  intents: Intent[];
  mandate: Mandate | null;
  usage: SpendUsage;
  pending: Intent[];
  webhooks: WebhookEvent[];
  ledger?: LedgerEvent[];
  ledgerVerification?: { ok: boolean; count: number; brokenAt: number | null };
};

export function ownerHeaders(): Record<string, string> {
  const pin = typeof window !== "undefined" ? window.localStorage.getItem("mandate.ownerPin") : null;
  return pin ? { "x-owner-pin": pin } : {};
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...ownerHeaders(), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `${res.status} ${res.statusText}`);
  return json;
}

const shared: { data: Activity | null; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null; ledger: boolean } = {
  data: null,
  listeners: new Set(),
  timer: null,
  ledger: false,
};

async function refresh() {
  try {
    shared.data = await api<Activity>(`/api/v1/activity${shared.ledger ? "?ledger=1" : ""}`);
    shared.listeners.forEach((l) => l());
  } catch {
    /* keep last good data */
  }
}

/** Shared, polled snapshot of everything the owner UI shows. */
export function useActivity(intervalMs = 3000, withLedger = false) {
  const [, force] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const l = () => mounted.current && force((n) => n + 1);
    shared.listeners.add(l);
    if (withLedger && !shared.ledger) shared.ledger = true;
    void refresh();
    if (!shared.timer) shared.timer = setInterval(refresh, intervalMs);
    return () => {
      mounted.current = false;
      shared.listeners.delete(l);
      if (shared.listeners.size === 0 && shared.timer) {
        clearInterval(shared.timer);
        shared.timer = null;
      }
    };
  }, [intervalMs, withLedger]);
  const reload = useCallback(() => refresh(), []);
  return { data: shared.data, reload };
}

export const money = (cents: number, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
export const when = (d: string | Date) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const ago = (d: string | Date) => {
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const statusMeta: Record<string, { label: string; cls: string }> = {
  evaluating: { label: "Evaluating", cls: "pill-info" },
  auto_approved: { label: "Approved", cls: "pill-paid" },
  approved: { label: "Approved", cls: "pill-paid" },
  paid: { label: "Paid", cls: "pill-paid" },
  needs_human: { label: "Needs you", cls: "pill-wait" },
  denied: { label: "Denied", cls: "pill-deny" },
  failed: { label: "Failed", cls: "pill-deny" },
  refunded: { label: "Refunded", cls: "pill-muted" },
};
