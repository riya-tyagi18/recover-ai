import { getLatestBatch } from "@/lib/db/batches";
import { getBatchAnalytics } from "@/lib/analytics";
import { formatInrFromPaise } from "@/lib/format";
import { STRATEGY_LABELS } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function StrategyComparisonPage() {
  const batch = await getLatestBatch();

  if (!batch) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display mb-8 text-3xl italic tracking-tight">Strategy Comparison</h1>
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">Loading sample data…</p>
          <p className="mt-2 text-sm text-muted">Refresh in a moment — seeding synthetic payments.</p>
        </div>
      </div>
    );
  }

  const analytics = await getBatchAnalytics(batch.id);
  const strategies = Object.entries(analytics.strategyPerformance).sort(
    (a, b) => b[1].recoveryRate - a[1].recoveryRate
  );

  const best = strategies[0];
  const bestLabel = best
    ? STRATEGY_LABELS[best[0] as keyof typeof STRATEGY_LABELS] || best[0]
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">Strategy Comparison</h1>
          <span className="badge-at-risk">Sample data</span>
        </div>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          {bestLabel
            ? `Across ${batch.paymentCount} sample payments, "${bestLabel}" achieved the highest recovery rate (${best![1].recoveryRate.toFixed(1)}%). Each strategy is assigned evenly, so results reflect natural variation in payment failure types.`
            : "Recovery strategy performance across all assigned approaches. Synthetic data for demonstration."}
        </p>
      </header>

      {/* Bar chart visual */}
      <div className="card p-6 space-y-4">
        <h2 className="font-display text-lg italic text-foreground">Recovery rate by strategy</h2>
        <div className="space-y-3.5">
          {strategies.map(([strategy, stats]) => {
            const label = STRATEGY_LABELS[strategy as keyof typeof STRATEGY_LABELS] || strategy;
            return (
              <div key={strategy} className="space-y-1">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="text-muted font-medium">{stats.recoveryRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, stats.recoveryRate)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="table-container">
          <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Strategy</th>
              <th className="px-4 py-3 font-medium">Assignments</th>
              <th className="px-4 py-3 font-medium">Recovered</th>
              <th className="px-4 py-3 font-medium">Recovery Rate</th>
              <th className="px-4 py-3 font-medium">₹ Recovered</th>
            </tr>
          </thead>
          <tbody>
            {strategies.map(([strategy, stats]) => (
              <tr key={strategy} className="border-b border-border/70 last:border-0">
                <td className="px-4 py-4 font-medium text-foreground">
                  {STRATEGY_LABELS[strategy as keyof typeof STRATEGY_LABELS] || strategy}
                </td>
                <td className="px-4 py-4">{stats.count}</td>
                <td className="px-4 py-4">{stats.recoveredCount}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-2">
                    <span className="w-12">{stats.recoveryRate.toFixed(1)}%</span>
                    <div className="h-1.5 w-24 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${stats.recoveryRate}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{formatInrFromPaise(stats.recoveredPaise)}</td>
              </tr>
            ))}
            {strategies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">No strategies assigned in this batch.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/simulate" className="text-sm text-accent hover:underline">
          View individual payments →
        </Link>
      </div>
    </div>
  );
}
