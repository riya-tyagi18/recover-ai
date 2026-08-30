import { getLatestBatch } from "@/lib/db/batches";
import { getBatchAnalytics } from "@/lib/analytics";
import { formatInrFromPaise } from "@/lib/format";
import { STRATEGY_LABELS } from "@/lib/types";
import Link from "next/link";

export default async function StrategyLabPage() {
  const batch = await getLatestBatch();

  if (!batch) {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display mb-8 text-3xl italic tracking-tight">Strategy Lab</h1>
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No batch data available</p>
          <p className="mt-2 text-sm text-muted">Generate and run a batch in the Simulation Center first.</p>
        </div>
      </div>
    );
  }

  const analytics = await getBatchAnalytics(batch.id);
  const strategies = Object.entries(analytics.strategyPerformance).sort(
    (a, b) => b[1].recoveryRate - a[1].recoveryRate
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Phase 2 Experiments</p>
        <h1 className="font-display mt-1 text-3xl italic tracking-tight">Strategy Lab</h1>
        <p className="mt-2 text-sm text-muted">A/B Strategy performance and assignments.</p>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
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
      
      <div className="flex justify-end">
        <Link href="/simulate" className="text-sm text-accent hover:underline">
          Go to Simulation Center to view individual payments →
        </Link>
      </div>
    </div>
  );
}
