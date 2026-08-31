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
  | { status: "ready"; batch: BatchDetail | null; reused?: boolean }
  | { status: "error"; message: string };

export default function SimulatePage() {
  const [seed, setSeed] = useState(42);
  const [count, setCount] = useState(100);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  const loadLatest = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/batches");
      if (!res.ok) throw new Error("Could not load batches.");
      const data = (await res.json()) as { latest: BatchDetail | null };
      setState({ status: "ready", batch: data.latest });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLatest();
  }, [loadLatest]);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, count }),
      });
      const data = (await res.json()) as {
        batch?: BatchDetail;
        error?: string;
        reused?: boolean;
      };
      if (!res.ok || !data.batch) {
        throw new Error(data.error ?? "Generation failed.");
      }
      setState({ status: "ready", batch: data.batch, reused: data.reused });
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

  const [runProgress, setRunProgress] = useState(0);

  async function runBatch() {
    if (!batch) return;
    setBusy(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id }),
      });
      if (!res.ok) throw new Error("Failed to run batch");
      const data = await res.json();
      setRunProgress(data.processedCount);
      await loadLatest(); // Reload batch data to see results
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-accent">
            Phase 1 checkpoint
          </p>
          <h1 className="font-display mt-1 text-3xl italic tracking-tight">
            Simulation Center
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Seeded, deterministic failed payments. Same seed always produces the same
            batch — safe to re-run live if a demo hiccups.
          </p>
        </div>
      </header>

      <section className="mb-8 flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Seed
            <input
              type="number"
              min={0}
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              className="h-10 w-28 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Payments (50–100)
            <input
              type="number"
              min={50}
              max={100}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-10 w-32 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="h-10 rounded-md bg-background border border-border px-4 text-sm text-foreground transition-colors hover:bg-border disabled:opacity-60"
          >
            {busy && !batch ? "Generating…" : "Generate batch"}
          </button>

          <button
            type="button"
            onClick={() => void runBatch()}
            disabled={busy || !batch || batch.status === "completed"}
            className="h-10 rounded-md bg-accent px-4 text-sm text-white transition-colors hover:bg-accent-hover disabled:opacity-60 ml-auto"
          >
            {busy && batch ? "Processing..." : "Run Recovery Pipeline"}
          </button>
        </div>

        {batch && batch.status === "completed" && (
          <p className="text-sm text-accent">✓ Batch recovery run complete. Check Overview.</p>
        )}
        <p className="text-xs text-muted">
          Demo default: seed <span className="text-foreground">42</span>, count{" "}
          <span className="text-foreground">100</span>. Agent run lands in Phase 2.
        </p>
      </section>

      {state.status === "loading" ? (
        <p className="text-sm text-muted">Loading latest batch…</p>
      ) : null}

      {state.status === "error" ? (
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
      ) : null}

      {state.status === "ready" && !batch ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No batch yet</p>
          <p className="mt-2 text-sm text-muted">
            Generate 50–100 failed payments to inspect the dataset.
          </p>
        </div>
      ) : null}

      {batch ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Payments" value={String(batch.paymentCount)} />
            <Stat
              label="Value at risk"
              value={formatInrFromPaise(batch.valueAtRiskPaise)}
              hint="Sum of this batch, not a hardcoded figure"
            />
            <Stat label="Seed" value={String(batch.seed)} />
            <Stat
              label="Batch"
              value={batch.id}
              hint={
                state.status === "ready" && state.reused
                  ? "Reused existing seed (identical dataset)"
                  : undefined
              }
            />
          </div>

          {categoryCounts.length > 0 ? (
            <p className="mb-4 text-xs text-muted">
              Failure mix:{" "}
              {categoryCounts.map(([cat, n], i) => (
                <span key={cat}>
                  {i > 0 ? " · " : ""}
                  {FAILURE_CATEGORY_LABELS[cat]} {n}
                </span>
              ))}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="max-h-[640px] overflow-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <thead className="sticky top-0 bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Failure</th>
                    <th className="px-4 py-3 font-medium">Segment</th>
                    <th className="px-4 py-3 font-medium">Retries</th>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Failed at</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.payments.map((row) => (
                    <tr key={row.id} className="border-b border-border/70 last:border-0 hover:bg-muted/5">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/payment/${row.id}`} className="text-accent hover:underline">
                          {row.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>{row.customer.name}</div>
                        <div className="text-xs text-muted">
                          {row.paymentMethod} · {row.bank}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatInrFromPaise(row.amountPaise)}</td>
                      <td className="px-4 py-3">
                        {FAILURE_CATEGORY_LABELS[row.failure.category]}
                      </td>
                      <td className="px-4 py-3">{SEGMENT_LABELS[row.customer.segment]}</td>
                      <td className="px-4 py-3">{row.retryCount}</td>
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
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 truncate font-display text-xl italic">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}
