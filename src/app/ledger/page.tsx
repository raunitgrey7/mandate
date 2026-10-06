"use client";

import { useMemo, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, type ColDef, type GridApi, themeQuartz, colorSchemeDark } from "ag-grid-community";
import { useActivity, money } from "@/lib/client";
import { Card, PageHeader, Pill } from "@/components/ui";
import type { Intent, LedgerEvent } from "@/lib/db/schema";
import { Download, ShieldCheck, ShieldAlert } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: "#141821",
  foregroundColor: "#e8ebf1",
  headerBackgroundColor: "#1a1f2a",
  headerTextColor: "#a3abbd",
  borderColor: "#242a37",
  rowHoverColor: "rgba(122,162,255,0.08)",
  accentColor: "#7aa2ff",
  fontFamily: "inherit",
  fontSize: 13,
  headerHeight: 40,
  rowHeight: 40,
  wrapperBorderRadius: 12,
});

type Row = Intent & { agentName: string; agentColor: string; amount: number; decisionSummary: string };

export default function Ledger() {
  const { data } = useActivity(3000, true);
  const [tab, setTab] = useState<"requests" | "chain">("requests");
  const [api, setApi] = useState<GridApi | null>(null);
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const byId = Object.fromEntries(data.agents.map((a) => [a.id, a]));
    return data.intents.map((i) => ({ ...i, agentName: byId[i.agentId]?.name ?? i.agentId, agentColor: byId[i.agentId]?.color ?? "#888", amount: i.amountCents / 100, decisionSummary: i.decision?.summary ?? "" }));
  }, [data]);

  const cols = useMemo<ColDef<Row>[]>(
    () => [
      { field: "createdAt", headerName: "When", valueFormatter: (p) => new Date(p.value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), sort: "desc", width: 150 },
      { field: "agentName", headerName: "Agent", width: 110, cellRenderer: (p: { value: string; data?: Row }) => <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.data?.agentColor }} />{p.value}</span> },
      { field: "kind", width: 100 },
      { field: "merchant", headerName: "Merchant / Recipient", flex: 1, minWidth: 160 },
      { field: "category", width: 120 },
      { field: "amount", headerName: "Amount", width: 110, type: "numericColumn", valueFormatter: (p) => money(Math.round(p.value * 100)), cellClass: "num" },
      { field: "status", width: 130, cellRenderer: (p: { value: string }) => <Pill status={p.value} /> },
      { field: "risk", width: 80, type: "numericColumn", cellClass: "num" },
      { field: "decisionSummary", headerName: "Decision", flex: 1.4, minWidth: 220, tooltipField: "decisionSummary" },
      { field: "paypalCaptureId", headerName: "PayPal capture", width: 190, cellClass: "num" },
      { field: "paypalPayoutBatchId", headerName: "Payout batch", width: 160, cellClass: "num" },
      { field: "paypalRefundId", headerName: "Refund", width: 160, cellClass: "num" },
      { field: "id", headerName: "Request", width: 160, cellClass: "num" },
    ],
    [],
  );
  const chainCols = useMemo<ColDef<LedgerEvent>[]>(
    () => [
      { field: "seq", width: 80, sort: "desc", cellClass: "num" },
      { field: "createdAt", headerName: "When", width: 150, valueFormatter: (p) => new Date(p.value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }) },
      { field: "type", width: 230, cellClass: "num" },
      { field: "intentId", headerName: "Request", width: 160, cellClass: "num" },
      { field: "payload", headerName: "Payload", flex: 1, minWidth: 300, valueFormatter: (p) => JSON.stringify(p.value), tooltipValueGetter: (p) => JSON.stringify(p.value, null, 2) },
      { field: "hash", width: 150, cellClass: "num", valueFormatter: (p) => String(p.value).slice(0, 16) + "…" },
      { field: "prevHash", headerName: "Prev", width: 150, cellClass: "num", valueFormatter: (p) => String(p.value).slice(0, 16) + "…" },
    ],
    [],
  );
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true, floatingFilter: false }), []);
  const onGridReady = useCallback((e: { api: GridApi }) => setApi(e.api), []);
  const v = data?.ledgerVerification;
  return (
    <>
      <PageHeader kicker="Ledger" title={<>Every decision, <em className="italic">receipted</em></>}>
        {v && (
          <span className={`pill ${v.ok ? "pill-paid" : "pill-deny"}`}>
            {v.ok ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />} chain {v.ok ? "intact" : `broken at #${v.brokenAt}`} · {v.count} events
          </span>
        )}
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button className={`px-3 py-1.5 text-[13px] ${tab === "requests" ? "bg-surface-2" : "text-fg-2"}`} onClick={() => setTab("requests")}>Requests</button>
          <button className={`px-3 py-1.5 text-[13px] ${tab === "chain" ? "bg-surface-2" : "text-fg-2"}`} onClick={() => setTab("chain")}>Hash chain</button>
        </div>
        <button className="btn" onClick={() => api?.exportDataAsCsv({ fileName: `mandate-${tab}.csv` })}>
          <Download size={14} /> CSV
        </button>
      </PageHeader>
      <Card className="p-2">
        <div style={{ height: "calc(100vh - 220px)", minHeight: 420 }}>
          {tab === "requests" ? (
            <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} defaultColDef={defaultColDef} animateRows onGridReady={onGridReady} getRowId={(p) => p.data.id} tooltipShowDelay={300} />
          ) : (
            <AgGridReact<LedgerEvent> theme={theme} rowData={data?.ledger ?? []} columnDefs={chainCols} defaultColDef={defaultColDef} animateRows onGridReady={onGridReady} getRowId={(p) => String(p.data.seq)} tooltipShowDelay={300} />
          )}
        </div>
      </Card>
      <p className="text-[12px] text-fg-3 mt-3">
        Table by AG Grid. The hash chain commits each event to the one before it (SHA-256), so a tampered history fails verification. PayPal webhook events are pinned into the same chain.
      </p>
    </>
  );
}
