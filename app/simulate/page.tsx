/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FAILURE_CATEGORY_LABELS,
  SEGMENT_LABELS,
  STRATEGY_LABELS,
  type FailureCategory,
} from "@/lib/types";
import type { BatchDetail } from "@/lib/batch-types";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import Link from "next/link";

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ready"; batch: BatchDetail | null }
  | { status: "error"; message: string };

const STATUS_COLORS: Record<string, string> = {
  recovered: "text-green-700 bg-green-50 border-green-200",
  stopped: "text-red-700 bg-red-50 border-red-200",
  recovering: "text-amber-700 bg-amber-50 border-amber-200",
  failed: "text-muted bg-background border-border",
};
const STATUS_LABELS: Record<string, string> = {
  recovered: "Recovered",
  stopped: "Stopped",
  recovering: "In progress",
  failed: "Pending",
};

export default function AllPaymentsPage() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  const loadLatest = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/batches");
      let data: { latest: BatchDetail | null } = { latest: null };
      if (res.headers.get("content-type")?.includes("application/json")) {
        data = await res.json();
      }
      if (!res.ok) throw new Error(`Could not load payments (${res.status}).`);
      setState({ status: "ready", batch: data.latest });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  async function runRecovery() {
    const batch = state.status === "ready" ? state.batch : null;
    if (!batch) return;
    setBusy(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      let runData: { error?: string } = {};
      if (res.headers.get("content-type")?.includes("application/json")) {
        runData = await res.json();
      }
      if (!res.ok) throw new Error(runData.error ?? `Recovery pipeline failed (${res.status}).`);
      await loadLatest();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  const batch = state.status === "ready" ? state.batch : null;

  const categoryCounts = useMemo(() => {
    if (!batch) return [];
    const counts = new Map<FailureCategory, number>();
    for (const row of batch.payments) {
      counts.set(row.failure.category, (counts.get(row.failure.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [batch]);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">All Payments</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Every failed payment we found, and what the recovery agent did about it.
          </p>
        </div>
        {batch && batch.status !== "completed" && (
          <button
            type="button"
            onClick={() => void runRecovery()}
            disabled={busy}
            className="h-10 rounded-md bg-accent px-5 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Recovering…" : "Run recovery now"}
          </button>
        )}
        {batch && batch.status === "completed" && (
          <Link
            href="/overview"
            className="h-10 inline-flex items-center rounded-md border border-accent px-5 text-sm text-accent hover:bg-accent-muted transition-colors"
          >
            View Dashboard →
          </Link>
        )}
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-muted">Loading payments…</p>
      )}

      {state.status === "error" && (
        <div className="rounded-xl border border-border bg-surface px-5 py-8">
          <p className="text-sm text-foreground">{state.message}</p>
          <button
            type="button"
            onClick={() => void loadLatest()}
            className="mt-3 text-sm text-accent underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && !batch && (
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No payments loaded</p>
          <p className="mt-2 text-sm text-muted">
            Connect your payment account to get started.
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
          >
            Connect payments
          </Link>
        </div>
      )}

      {batch && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Payments" value={String(batch.paymentCount)} />
            <Stat
              label="Value at risk"
              value={formatInrFromPaise(batch.valueAtRiskPaise)}
            />
            <Stat
              label="Status"
              value={batch.status === "completed" ? "Recovery complete" : "Pending recovery"}
            />
            <Stat
              label="Failure types"
              value={String(categoryCounts.length)}
            />
          </div>

          {categoryCounts.length > 0 && (
            <p className="mb-4 text-xs text-muted">
              Failure breakdown:{" "}
              {categoryCounts.map(([cat, n], i) => (
                <span key={cat}>
                  {i > 0 ? " · " : ""}
                  {FAILURE_CATEGORY_LABELS[cat]} ({n})
                </span>
              ))}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Failure reason</th>
                    <th className="px-4 py-3 font-medium">Segment</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recovery action</th>
                    <th className="px-4 py-3 font-medium">Failed at</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.payments.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 last:border-0 hover:bg-muted/5"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/payment/${row.id}`}
                          className="text-accent hover:underline"
                        >
                          {row.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.customer.name}</div>
                        <div className="text-xs text-muted">
                          {row.paymentMethod?.toUpperCase()} · {row.bank}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatInrFromPaise(row.amountPaise)}</td>
                      <td className="px-4 py-3">
                        {FAILURE_CATEGORY_LABELS[row.failure.category]}
                      </td>
                      <td className="px-4 py-3">{SEGMENT_LABELS[row.customer.segment]}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_COLORS[row.status] ?? "text-muted border-border bg-background"}`}
                        >
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {STRATEGY_LABELS[row.assignedStrategy]}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {formatDateTime(row.failedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 truncate font-display text-xl italic">{value}</p>
    </div>
  );
}
