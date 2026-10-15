import { getLatestBatch } from "@/lib/db/batches";
import { getBatchAnalytics } from "@/lib/analytics";
import { formatInrFromPaise } from "@/lib/format";
import { FAILURE_CATEGORY_LABELS } from "@/lib/types";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { computeDashboardChartData } from "@/lib/dashboard-data";
import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const sessionResult = await validateSession();
  if (!sessionResult) redirect("/login");
  if (sessionResult.user.role !== "owner") redirect("/customer/dashboard");

  const batch = await getLatestBatch();

  // Empty state handling
  if (!batch || batch.payments.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            Recovery metrics and autonomous agent performance overview.
          </p>
        </header>

        <div className="card p-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-lg bg-accent-muted flex items-center justify-center">
            <span className="font-display text-xl italic font-bold text-accent">R</span>
          </div>
          <h2 className="font-display text-xl italic text-foreground">No payments loaded yet</h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            Synthetic transaction data has not been seeded yet. You can initialize payments from the payments view.
          </p>
          <div className="pt-2">
            <Link
              href="/simulate"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Go to All Payments
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const analytics = await getBatchAnalytics(batch.id);
  const chartData = computeDashboardChartData(batch, analytics);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl italic tracking-tight text-foreground">Dashboard</h1>
            <span className="badge-at-risk">Sample data</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Recovery results modelled on real Razorpay failure codes. Synthetic dataset for demonstration.
          </p>
        </div>
        <Link
          href="/simulate"
          className="text-xs font-medium text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
        >
          View all payments
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </header>

      {/* Key Metrics (KPIs) */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard
          label="Total payments"
          value={String(analytics.totalPayments)}
          subtext="Processed in batch"
        />
        <StatCard
          label="Value at risk"
          value={formatInrFromPaise(analytics.valueAtRiskPaise)}
          subtext="Failed transaction volume"
          statusColor="text-amber-800"
        />
        <StatCard
          label="Recovered"
          value={formatInrFromPaise(analytics.recoveredPaise)}
          subtext="Automated recovered revenue"
          highlight={analytics.recoveredPaise > 0}
        />
        <StatCard
          label="Recovery rate"
          value={`${analytics.recoveryRate.toFixed(1)}%`}
          subtext="Target benchmark: >30%"
        />
        <StatCard
          label="Avg attempts"
          value={analytics.averageRetries.toFixed(1)}
          subtext="Attempts per payment"
        />
      </section>

      {/* Charts Section: Timeline + Failure Reasons */}
      <section>
        <DashboardCharts
          timeSeries={chartData.timeSeries}
          failureReasons={chartData.failureReasons}
          paymentMethods={chartData.paymentMethods}
          totalPayments={analytics.totalPayments}
          valueAtRiskPaise={analytics.valueAtRiskPaise}
          recoveredPaise={analytics.recoveredPaise}
          recoveryRate={analytics.recoveryRate}
        />
      </section>

      {/* Funnel & Why Payments Failed Breakdown */}
      <section className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Recovery Funnel */}
        <div className="space-y-3">
          <h2 className="font-display text-2xl italic text-foreground">Recovery funnel</h2>
          <div className="card p-6">
            <div className="flex flex-col gap-4">
              <FunnelStep
                label="Total failed payments"
                value={analytics.totalPayments}
                total={analytics.totalPayments}
                colorClass="bg-muted/30"
              />
              <FunnelStep
                label="Recovery attempted"
                value={
                  analytics.statusBreakdown.recovering +
                  analytics.statusBreakdown.recovered +
                  analytics.statusBreakdown.stopped
                }
                total={analytics.totalPayments}
                colorClass="bg-[#3b5998]"
              />
              <FunnelStep
                label="Successfully recovered"
                value={analytics.statusBreakdown.recovered}
                total={analytics.totalPayments}
                colorClass="bg-accent"
              />
              <FunnelStep
                label="Needs manual review"
                value={analytics.statusBreakdown.stopped}
                total={analytics.totalPayments}
                colorClass="bg-[#b45309]"
              />
            </div>
          </div>
        </div>

        {/* Failure Reasons Ranked List */}
        <div className="space-y-3">
          <h2 className="font-display text-2xl italic text-foreground">Why payments failed</h2>
          <div className="card p-6">
            <div className="flex flex-col gap-3.5">
              {Object.entries(analytics.reasonBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, count]) => {
                  const pct = ((count / analytics.totalPayments) * 100).toFixed(0);
                  return (
                    <div key={reason} className="flex justify-between items-center text-sm">
                      <span className="text-muted text-xs sm:text-sm">
                        {FAILURE_CATEGORY_LABELS[reason as keyof typeof FAILURE_CATEGORY_LABELS] || reason}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{count}</span>
                        <span className="text-xs text-muted">({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </section>

      {/* Case types covered ("What We're Recovering" - content kept untouched) */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl italic text-foreground">What we&apos;re recovering</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CaseCard
            tag="Retry"
            title="Failed payment retry"
            desc="Retries timed to the highest-probability recovery window for each failure type."
          />
          <CaseCard
            tag="Checkout"
            title="Checkout drop-off"
            desc="Detects abandoned checkouts and sends a timely nudge to complete payment."
          />
          <CaseCard
            tag="Subscription"
            title="Subscription billing"
            desc="Recovers failed recurring charges before the subscription lapses."
          />
          <CaseCard
            tag="B2B"
            title="B2B receivables"
            desc="Follows up on overdue invoices with escalating, compliance-safe reminders."
          />
          <CaseCard
            tag="Mandate"
            title="Mandate retry"
            desc="Re-presents NACH/UPI autopay mandates after temporary bank errors."
          />
          <CaseCard
            tag="Promise"
            title="Promise-to-pay"
            desc="Tracks payment promises and sends gentle Hinglish nudges at the right moment."
          />
        </div>
      </section>

      {/* Recent payments CTA */}
      <section className="space-y-4">
        <div className="flex justify-between items-end">
          <h2 className="font-display text-2xl italic text-foreground">Recent activity</h2>
          <Link
            href="/simulate"
            className="text-xs font-medium text-accent hover:text-accent-hover transition-colors flex items-center gap-1"
          >
            View all
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
        <div className="card p-6">
          <p className="text-sm text-muted">
            Select any payment from{" "}
            <Link href="/simulate" className="font-medium text-accent hover:underline">
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
  subtext,
  highlight = false,
  statusColor,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
  statusColor?: string;
}) {
  return (
    <div
      className={`card p-4 transition-all ${
        highlight ? "border-accent/40 bg-accent-muted/40 shadow-sm" : ""
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">{label}</p>
      <p
        className={`mt-1 font-display text-2xl italic tracking-tight ${
          highlight ? "text-accent font-semibold" : statusColor ? statusColor : "text-foreground"
        }`}
      >
        {value}
      </p>
      {subtext && <p className="mt-1 text-[10px] text-muted truncate">{subtext}</p>}
    </div>
  );
}

function FunnelStep({
  label,
  value,
  total,
  colorClass = "bg-accent",
}: {
  label: string;
  value: number;
  total: number;
  colorClass?: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs sm:text-sm">
        <span className="text-foreground">{label}</span>
        <span className="font-semibold text-foreground">
          {value} <span className="text-xs text-muted font-normal">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div className="h-2 w-full bg-border rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-500 rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CaseCard({
  tag,
  title,
  desc,
}: {
  tag: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="card card-hover p-5">
      <span className="badge-recovered text-[10px] font-medium tracking-wider uppercase">{tag}</span>
      <p className="mt-3 font-semibold text-sm text-foreground">{title}</p>
      <p className="mt-1.5 text-xs text-muted leading-relaxed">{desc}</p>
    </div>
  );
}
