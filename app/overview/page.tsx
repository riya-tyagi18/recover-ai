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
        <h1 className="font-display mb-8 text-3xl italic tracking-tight">Dashboard</h1>
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No data yet</p>
          <p className="mt-2 text-sm text-muted">
            Connect your payment account to start recovering failed transactions.
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
          >
            Connect payments
          </Link>
        </div>
      </div>
    );
  }

  const analytics = await getBatchAnalytics(batch.id);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl italic tracking-tight">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            Recovery results across your connected account.
          </p>
        </div>
        <Link
          href="/simulate"
          className="text-xs text-accent hover:underline"
        >
          View all payments →
        </Link>
      </header>

      {/* Key metrics */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total payments" value={String(analytics.totalPayments)} />
        <StatCard label="Value at risk" value={formatInrFromPaise(analytics.valueAtRiskPaise)} />
        <StatCard
          label="Recovered"
          value={formatInrFromPaise(analytics.recoveredPaise)}
          highlight={analytics.recoveredPaise > 0}
        />
        <StatCard label="Recovery rate" value={`${analytics.recoveryRate.toFixed(1)}%`} />
        <StatCard label="Avg attempts" value={analytics.averageRetries.toFixed(1)} />
      </section>

      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Recovery funnel */}
        <div className="space-y-4">
          <h2 className="font-display text-2xl italic">Recovery funnel</h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              <FunnelStep label="Total failed payments" value={analytics.totalPayments} total={analytics.totalPayments} />
              <FunnelStep
                label="Recovery attempted"
                value={analytics.statusBreakdown.recovering + analytics.statusBreakdown.recovered + analytics.statusBreakdown.stopped}
                total={analytics.totalPayments}
              />
              <FunnelStep label="Successfully recovered" value={analytics.statusBreakdown.recovered} total={analytics.totalPayments} color="bg-green-500" />
              <FunnelStep label="Needs manual review" value={analytics.statusBreakdown.stopped} total={analytics.totalPayments} color="bg-amber-400" />
            </div>
          </div>
        </div>

        {/* Failure reasons */}
        <div className="space-y-4">
          <h2 className="font-display text-2xl italic">Why payments failed</h2>
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-col gap-3">
              {Object.entries(analytics.reasonBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => (
                  <div key={reason} className="flex justify-between items-center">
                    <span className="text-sm text-muted">
                      {FAILURE_CATEGORY_LABELS[reason as keyof typeof FAILURE_CATEGORY_LABELS] || reason}
                    </span>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </section>

      {/* Case types covered */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl italic">What we&apos;re recovering</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CaseCard
            icon="🔄"
            title="Failed payment retry"
            desc="Auto-retries timed to the highest-probability window for each failure type."
          />
          <CaseCard
            icon="🛒"
            title="Checkout drop-off"
            desc="Detects abandoned checkouts and sends a timely nudge to complete payment."
          />
          <CaseCard
            icon="📅"
            title="Subscription billing"
            desc="Recovers failed recurring charges before the subscription lapses."
          />
          <CaseCard
            icon="🏢"
            title="B2B receivables"
            desc="Follows up on overdue invoices with escalating, compliance-safe reminders."
          />
          <CaseCard
            icon="🔁"
            title="Mandate retry"
            desc="Re-presents NACH/UPI autopay mandates after temporary bank errors."
          />
          <CaseCard
            icon="🤝"
            title="Promise-to-pay"
            desc="Tracks payment promises and sends gentle Hinglish nudges at the right moment."
          />
        </div>
      </section>

      {/* Recent payments CTA */}
      <section className="space-y-4">
        <div className="flex justify-between items-end">
          <h2 className="font-display text-2xl italic">Recent activity</h2>
          <Link href="/simulate" className="text-xs text-accent hover:underline">
            View all →
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            Select any payment from{" "}
            <Link href="/simulate" className="text-accent hover:underline">
              All Payments
            </Link>{" "}
            to see its full detect → diagnose → choose → execute → recovered trail.
          </p>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-4 py-4 ${highlight ? "border-accent bg-accent-muted" : "border-border bg-surface"}`}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl italic ${highlight ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  total,
  color = "bg-accent",
}: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">
          {value} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CaseCard({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <span className="text-2xl">{icon}</span>
      <p className="mt-3 font-medium text-sm">{title}</p>
      <p className="mt-1 text-xs text-muted leading-relaxed">{desc}</p>
    </div>
  );
}
