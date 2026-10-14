"use client";

import { useEffect, useState, useMemo } from "react";
import { FAILURE_CATEGORY_LABELS } from "@/lib/types";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import type { AuditLog, Payment, Customer, FailureEvent } from "@/lib/types";
import Link from "next/link";

type RowData = {
  log: AuditLog;
  payment?: Payment;
  customer?: Customer;
  failure?: FailureEvent;
};

const PLAIN_ACTIONS: Record<string, string> = {
  diagnosed: "Analysed the failure",
  probability_calculated: "Estimated recovery chances",
  strategy_selected: "Chose a recovery approach",
  timing_selected: "Scheduled the next action",
  action_executed: "Attempted recovery",
  result_observed: "Recorded the outcome",
  "nudge.sent": "Sent a reminder message",
  "batch.generated": "Loaded payment data",
};

function plainAction(action: string) {
  return PLAIN_ACTIONS[action] ?? action;
}

export default function ActivityLogPage() {
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/activity-log");
        if (!res.ok) throw new Error("failed");
        const data = await res.json() as { rows: RowData[] };
        setRows(data.rows);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      r.customer?.name?.toLowerCase().includes(q) ||
      r.log.action.toLowerCase().includes(q) ||
      r.log.reason.toLowerCase().includes(q) ||
      r.failure?.category.toLowerCase().includes(q) ||
      r.log.paymentId?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">Activity Log</h1>
          <span className="badge-at-risk">Sample data</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Per-payment timeline of what the agent did and why — diagnosis, action, retry count, stop reason.
        </p>
      </header>

      {/* Search */}
      <div>
        <input
          id="activity-search"
          type="search"
          placeholder="Search by customer, action, failure type or payment ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
        />
      </div>

      {loading && <p className="text-sm text-muted">Loading activity…</p>}

      {!loading && filtered.length === 0 && (
        <div className="card p-12 text-center">
          <p className="font-display text-xl italic text-foreground">
            {query ? "No results for that search" : "No activity yet"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {query ? "Try a different term." : "Data is being seeded — refresh in a moment."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <div className="table-container">
            <table className="w-full text-left text-sm min-w-[760px]">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Failure</th>
                <th className="px-4 py-3 font-medium">Action taken</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.log.id} className="border-b border-border/70 last:border-0 hover:bg-muted/5">
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {formatDateTime(r.log.at)}
                  </td>
                  <td className="px-4 py-3">
                    {r.log.paymentId ? (
                      <Link
                        href={`/payment/${r.log.paymentId}`}
                        className="text-accent hover:underline font-medium"
                      >
                        {r.customer?.name ?? r.log.paymentId}
                      </Link>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.payment ? formatInrFromPaise(r.payment.amountPaise) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {r.failure
                      ? FAILURE_CATEGORY_LABELS[r.failure.category as keyof typeof FAILURE_CATEGORY_LABELS]
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-sm">
                    {plainAction(r.log.action)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">
                    {r.log.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
