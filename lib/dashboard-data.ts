import type { BatchDetail } from "@/lib/batch-types";
import type { BatchAnalytics } from "@/lib/analytics";
import { FAILURE_CATEGORY_LABELS, type FailureCategory, type PaymentMethod } from "@/lib/types";
import type { TimeSeriesPoint, ReasonSlice, MethodStat } from "@/components/dashboard/DashboardCharts";

const PALETTE = [
  "#1e7054", // Emerald
  "#3b5998", // Slate blue
  "#b45309", // Amber / terracotta
  "#4d7c67", // Muted forest
  "#8c5332", // Warm copper
  "#5a6b7c", // Slate grey
  "#2d5a43", // Pine green
  "#6b7280", // Slate neutral
];

export function computeDashboardChartData(
  batch: BatchDetail,
  analytics: BatchAnalytics
): {
  timeSeries: TimeSeriesPoint[];
  failureReasons: ReasonSlice[];
  paymentMethods: MethodStat[];
} {
  const payments = batch.payments;
  const totalCount = payments.length || 1;

  // ─── 1. Failure Reasons Breakdown ──────────────────────────────
  const categoryMap = new Map<
    FailureCategory,
    { count: number; amountPaise: number; recoveredPaise: number }
  >();

  for (const p of payments) {
    const cat = p.failure.category;
    const curr = categoryMap.get(cat) ?? { count: 0, amountPaise: 0, recoveredPaise: 0 };
    curr.count += 1;
    curr.amountPaise += p.amountPaise;
    if (p.status === "recovered") {
      curr.recoveredPaise += p.recoveredAmountPaise || p.amountPaise;
    }
    categoryMap.set(cat, curr);
  }

  const failureReasons: ReasonSlice[] = [...categoryMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, data], idx) => {
      const pct = Number(((data.count / totalCount) * 100).toFixed(1));
      const recoveryRate = data.amountPaise > 0 ? (data.recoveredPaise / data.amountPaise) * 100 : 0;
      return {
        category: cat,
        name: FAILURE_CATEGORY_LABELS[cat] || cat,
        count: data.count,
        percentage: pct,
        amountPaise: data.amountPaise,
        recoveredPaise: data.recoveredPaise,
        recoveryRate,
        color: PALETTE[idx % PALETTE.length],
      };
    });

  // ─── 2. Payment Methods Breakdown ──────────────────────────────
  const methodMap = new Map<
    PaymentMethod,
    { count: number; recoveredCount: number; amountPaise: number; recoveredPaise: number }
  >();

  for (const p of payments) {
    const method = p.paymentMethod || ("card" as PaymentMethod);
    const curr = methodMap.get(method) ?? {
      count: 0,
      recoveredCount: 0,
      amountPaise: 0,
      recoveredPaise: 0,
    };
    curr.count += 1;
    curr.amountPaise += p.amountPaise;
    if (p.status === "recovered") {
      curr.recoveredCount += 1;
      curr.recoveredPaise += p.recoveredAmountPaise || p.amountPaise;
    }
    methodMap.set(method, curr);
  }

  const paymentMethods: MethodStat[] = [...methodMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([method, data]) => ({
      method,
      name: method.toUpperCase(),
      count: data.count,
      recoveredCount: data.recoveredCount,
      amountPaise: data.amountPaise,
      recoveredPaise: data.recoveredPaise,
      recoveryRate: data.count > 0 ? (data.recoveredCount / data.count) * 100 : 0,
    }));

  // ─── 3. Timeline (Recovered vs At-Risk over time) ───────────────
  // Sort payments chronologically by failedAt
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.failedAt).getTime() - new Date(b.failedAt).getTime()
  );

  const numIntervals = 7;
  const timeSeries: TimeSeriesPoint[] = [];

  if (sortedPayments.length === 0) {
    return { timeSeries, failureReasons, paymentMethods };
  }

  const startTime = new Date(sortedPayments[0].failedAt).getTime();
  const endTime = new Date(sortedPayments[sortedPayments.length - 1].failedAt).getTime();
  const timeSpan = Math.max(endTime - startTime, 3600000); // minimum 1 hour

  for (let i = 0; i <= numIntervals; i++) {
    const stepTime = startTime + (timeSpan * i) / numIntervals;
    const stepDate = new Date(stepTime);

    // Payments that failed up to this step
    const eligiblePayments =
      i === numIntervals
        ? sortedPayments
        : sortedPayments.filter((p) => new Date(p.failedAt).getTime() <= stepTime);

    const atRiskPaise = eligiblePayments.reduce((sum, p) => sum + p.amountPaise, 0);
    const recoveredPaise = eligiblePayments
      .filter((p) => p.status === "recovered")
      .reduce((sum, p) => sum + (p.recoveredAmountPaise || p.amountPaise), 0);

    const hoursAgo = Math.round((endTime - stepTime) / (1000 * 60 * 60));
    const label =
      i === 0
        ? "Initial"
        : i === numIntervals
        ? "Latest"
        : `${stepDate.toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
          })} ${stepDate.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })}`;

    timeSeries.push({
      timestamp: stepDate.toISOString(),
      label,
      atRiskPaise: i === numIntervals ? analytics.valueAtRiskPaise : atRiskPaise,
      recoveredPaise: i === numIntervals ? analytics.recoveredPaise : recoveredPaise,
      atRiskInr: Math.round(
        (i === numIntervals ? analytics.valueAtRiskPaise : atRiskPaise) / 100
      ),
      recoveredInr: Math.round(
        (i === numIntervals ? analytics.recoveredPaise : recoveredPaise) / 100
      ),
    });
  }

  return { timeSeries, failureReasons, paymentMethods };
}
