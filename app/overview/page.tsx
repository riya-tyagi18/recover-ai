import { getLatestBatch } from "@/lib/db/batches";
import { getBatchAnalytics } from "@/lib/analytics";
import { formatInrFromPaise } from "@/lib/format";
import { FAILURE_CATEGORY_LABELS } from "@/lib/types";
import Link from "next/link";

export default async function OverviewPage() {
  const batch = await getLatestBatch();

  if (!batch) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display mb-8 text-3xl italic tracking-tight">Overview</h1>
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No batch data available</p>
          <p className="mt-2 text-sm text-muted">Generate and run a batch in the Simulation Center first.</p>
        </div>
      </div>
    );
  }

  const analytics = await getBatchAnalytics(batch.id);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Phase 2 Dashboard</p>
        <h1 className="font-display mt-1 text-3xl italic tracking-tight">Overview</h1>
        <p className="mt-2 text-sm text-muted">Live batch recovery statistics.</p>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total Payments" value={String(analytics.totalPayments)} />
        <StatCard label="Value At Risk" value={formatInrFromPaise(analytics.valueAtRiskPaise)} />
        <StatCard label="Recovered" value={formatInrFromPaise(analytics.recoveredPaise)} />
        <StatCard label="Recovery Rate" value={`${analytics.recoveryRate.toFixed(1)}%`} />
        <StatCard label="Avg Retries" value={analytics.averageRetries.toFixed(2)} />
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="font-display text-2xl italic">Recovery Funnel</h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              <FunnelStep label="Failed" value={analytics.totalPayments} total={analytics.totalPayments} />
              <FunnelStep label="Attempted (Recovering + Recovered + Failed)" value={analytics.statusBreakdown.recovering + analytics.statusBreakdown.recovered + analytics.statusBreakdown.failed} total={analytics.totalPayments} />
              <FunnelStep label="Recovered" value={analytics.statusBreakdown.recovered} total={analytics.totalPayments} />
              <FunnelStep label="Stopped / Manual Review" value={analytics.statusBreakdown.stopped} total={analytics.totalPayments} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-2xl italic">Failure Reason Breakdown</h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              {Object.entries(analytics.reasonBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div key={reason} className="flex justify-between items-center">
                    <span className="text-sm text-muted">{FAILURE_CATEGORY_LABELS[reason as keyof typeof FAILURE_CATEGORY_LABELS] || reason}</span>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex justify-between items-end">
          <h2 className="font-display text-2xl italic">Recent Agent Activity</h2>
          <Link href="/simulate" className="text-xs text-accent hover:underline">View all in Simulation Center →</Link>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">To view detailed logs for an individual payment, select it from the Simulation Center or Strategy Lab.</p>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl italic">{value}</p>
    </div>
  );
}

function FunnelStep({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{value} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
