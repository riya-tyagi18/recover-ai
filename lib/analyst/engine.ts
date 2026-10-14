/**
 * Deterministic Backend Analytics Engine.
 * 
 * Computes all numbers, rankings, segments, and recommendations directly
 * from the database/store. The LLM only interprets and formats these results.
 */

import { readStore } from "@/lib/db/store";
import { getLatestBatch } from "@/lib/db/batches";
import { getBatchAnalytics } from "@/lib/analytics";
import { formatInrFromPaise } from "@/lib/format";
import {
  FAILURE_CATEGORY_LABELS,
  STRATEGY_LABELS,
  type Customer,
  type FailureCategory,
  type Payment,
} from "@/lib/types";
import {
  calculateDatasetThresholds,
  evaluateCustomerSegmentation,
  SEGMENT_METADATA,
  type CustomerMetrics,
  type CustomerSegmentationResult,
  type DatasetThresholds,
  type SegmentType,
} from "./segmentation";

// ─── String Similarity Helpers for Close Matches ──────────────────────
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export function findCloseMatches(
  target: string,
  candidates: { id: string; name?: string }[],
  limit = 4
): { id: string; name?: string }[] {
  const normalized = target.trim().toLowerCase();
  const scored = candidates.map((c) => {
    const idDist = levenshteinDistance(normalized, c.id.toLowerCase());
    const nameDist = c.name ? levenshteinDistance(normalized, c.name.toLowerCase()) : 999;
    const isSubstring =
      c.id.toLowerCase().includes(normalized) ||
      (c.name && c.name.toLowerCase().includes(normalized));
    const score = isSubstring ? Math.min(idDist, nameDist) - 5 : Math.min(idDist, nameDist);
    return { candidate: c, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.candidate);
}

// ─── Customer Metrics Aggregator ──────────────────────────────────────
export function buildCustomerMetrics(
  customer: Customer,
  payments: Payment[],
  failures: { paymentId: string; category: FailureCategory }[]
): CustomerMetrics {
  const custPayments = payments.filter((p) => p.customerId === customer.id);
  const failureCategoryCounts: Record<string, number> = {};

  let currentBatchValuePaise = 0;
  let valueAtRiskPaise = 0;
  let recoveredPaise = 0;
  let retriesExecuted = 0;
  let recoveredByRetryCount = 0;
  let retriesExhaustedWithoutRecovery = false;

  for (const p of custPayments) {
    currentBatchValuePaise += p.amountPaise;
    retriesExecuted += p.retryCount;

    if (p.status === "recovered") {
      recoveredPaise += p.recoveredAmountPaise || p.amountPaise;
      if (p.retryCount > 0) recoveredByRetryCount += 1;
    } else {
      valueAtRiskPaise += p.amountPaise;
      if (p.retryCount >= 3 || p.status === "stopped") {
        retriesExhaustedWithoutRecovery = true;
      }
    }

    const fail = failures.find((f) => f.paymentId === p.id);
    if (fail) {
      const label = FAILURE_CATEGORY_LABELS[fail.category] || fail.category;
      failureCategoryCounts[label] = (failureCategoryCounts[label] || 0) + 1;
    }
  }

  // Combine with prior customer history
  const priorAttempts =
    (customer.priorSuccessCount || 0) +
    (custPayments[0]?.priorFailureCount || 0);

  const totalAttempts = Math.max(1, priorAttempts + custPayments.length + retriesExecuted);
  const totalFailures = (custPayments[0]?.priorFailureCount || 0) + custPayments.length;
  const failureRate = Math.min(1.0, totalFailures / totalAttempts);

  // Estimated total transaction value (batch payments + prior successes)
  const priorValuePaise =
    (customer.priorSuccessCount || 0) * (custPayments[0]?.amountPaise || 250000);
  const totalTransactionValuePaise = currentBatchValuePaise + priorValuePaise;

  const topFailureReasons = Object.entries(failureCategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  // Thin history flag
  const isLowConfidence = totalAttempts < 3;
  const confidenceReason = isLowConfidence
    ? `Thin payment history: only ${totalAttempts} recorded transaction attempt(s). Risk classification is preliminary.`
    : undefined;

  return {
    customerId: customer.id,
    customerName: customer.name,
    totalAttempts,
    totalFailures,
    failureRate,
    totalTransactionValuePaise,
    valueAtRiskPaise,
    recoveredPaise,
    retriesExecuted,
    recoveredByRetryCount,
    retriesExhaustedWithoutRecovery,
    isLowConfidence,
    confidenceReason,
    topFailureReasons,
  };
}

// ─── 1. getCustomer(idOrName) ─────────────────────────────────────────
export async function getCustomer(idOrName: string): Promise<
  | { found: true; customer: CustomerSegmentationResult; rawCustomer: Customer; payments: Payment[] }
  | { found: false; query: string; closeMatches: { id: string; name?: string }[] }
> {
  const store = await readStore();
  const query = idOrName.trim();
  const lower = query.toLowerCase();

  // Match exact ID or Name
  let customer = store.customers.find(
    (c) => c.id.toLowerCase() === lower || c.name.toLowerCase() === lower
  );

  // Partial match if not exact
  if (!customer) {
    customer = store.customers.find(
      (c) => c.id.toLowerCase().includes(lower) || c.name.toLowerCase().includes(lower)
    );
  }

  if (!customer) {
    const candidates = store.customers.map((c) => ({ id: c.id, name: c.name }));
    const closeMatches = findCloseMatches(query, candidates);
    return { found: false, query, closeMatches };
  }

  // Build metrics for this customer
  const failures = store.failureEvents.map((f) => ({ paymentId: f.paymentId, category: f.category }));
  const allCustomerMetrics = store.customers.map((c) =>
    buildCustomerMetrics(c, store.payments, failures)
  );
  const thresholds = calculateDatasetThresholds(allCustomerMetrics);

  const metrics = buildCustomerMetrics(customer, store.payments, failures);
  const segmentation = evaluateCustomerSegmentation(metrics, thresholds);
  const custPayments = store.payments.filter((p) => p.customerId === customer.id);

  return {
    found: true,
    customer: segmentation,
    rawCustomer: customer,
    payments: custPayments,
  };
}

// ─── 2. getPayment(id) ────────────────────────────────────────────────
export async function getPayment(id: string): Promise<
  | {
      found: true;
      payment: Payment;
      customer: Customer;
      failureReason: string;
      failureCategory: string;
      auditLogs: { at: string; action: string; reason: string }[];
    }
  | { found: false; query: string; closeMatches: { id: string }[] }
> {
  const store = await readStore();
  const query = id.trim();
  const lower = query.toLowerCase();

  const payment = store.payments.find(
    (p) => p.id.toLowerCase() === lower || p.id.toLowerCase().includes(lower)
  );

  if (!payment) {
    const candidates = store.payments.map((p) => ({ id: p.id }));
    const closeMatches = findCloseMatches(query, candidates);
    return { found: false, query, closeMatches };
  }

  const customer = store.customers.find((c) => c.id === payment.customerId) || {
    id: payment.customerId,
    name: "Unknown Customer",
    segment: "standard" as const,
    priorSuccessCount: 0,
    priorSuccessRate: 0,
    paymentMethod: payment.paymentMethod,
    bank: payment.bank,
    createdAt: payment.failedAt,
  };

  const failure = store.failureEvents.find((f) => f.paymentId === payment.id);
  const auditLogs = store.auditLogs
    .filter((l) => l.paymentId === payment.id)
    .map((l) => ({ at: l.at, action: l.action, reason: l.reason }));

  return {
    found: true,
    payment,
    customer,
    failureReason: failure?.reason || "Transaction failed at gateway",
    failureCategory: failure
      ? FAILURE_CATEGORY_LABELS[failure.category] || failure.category
      : "Unknown",
    auditLogs,
  };
}

// ─── 3. topFailureReasons() ───────────────────────────────────────────
export async function topFailureReasons(): Promise<{
  totalFailures: number;
  reasons: {
    category: string;
    label: string;
    count: number;
    percentage: number;
    amountPaise: number;
    recoveredPaise: number;
    recoveryRate: number;
  }[];
}> {
  const batch = await getLatestBatch();
  if (!batch) return { totalFailures: 0, reasons: [] };

  const analytics = await getBatchAnalytics(batch.id);
  const totalFailures = analytics.totalPayments;

  const categoryMap = new Map<
    string,
    { count: number; amountPaise: number; recoveredPaise: number }
  >();

  for (const p of batch.payments) {
    const cat = p.failure.category;
    const curr = categoryMap.get(cat) || { count: 0, amountPaise: 0, recoveredPaise: 0 };
    curr.count += 1;
    curr.amountPaise += p.amountPaise;
    if (p.status === "recovered") {
      curr.recoveredPaise += p.recoveredAmountPaise || p.amountPaise;
    }
    categoryMap.set(cat, curr);
  }

  const reasons = [...categoryMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, data]) => {
      const percentage = totalFailures > 0 ? Number(((data.count / totalFailures) * 100).toFixed(1)) : 0;
      const recoveryRate = data.amountPaise > 0 ? (data.recoveredPaise / data.amountPaise) * 100 : 0;
      return {
        category: cat,
        label: FAILURE_CATEGORY_LABELS[cat as FailureCategory] || cat,
        count: data.count,
        percentage,
        amountPaise: data.amountPaise,
        recoveredPaise: data.recoveredPaise,
        recoveryRate,
      };
    });

  return { totalFailures, reasons };
}

// ─── 4. revenueAtRisk() ───────────────────────────────────────────────
export async function revenueAtRisk(): Promise<{
  totalPayments: number;
  valueAtRiskPaise: number;
  valueAtRiskFormatted: string;
  recoveredPaise: number;
  recoveredFormatted: string;
  unresolvedPaise: number;
  unresolvedFormatted: string;
  recoveryRate: number;
  recoveryRateFormatted: string;
  byMethod: {
    method: string;
    count: number;
    valuePaise: number;
    recoveredPaise: number;
    recoveryRate: number;
  }[];
}> {
  const batch = await getLatestBatch();
  if (!batch) {
    return {
      totalPayments: 0,
      valueAtRiskPaise: 0,
      valueAtRiskFormatted: "₹0",
      recoveredPaise: 0,
      recoveredFormatted: "₹0",
      unresolvedPaise: 0,
      unresolvedFormatted: "₹0",
      recoveryRate: 0,
      recoveryRateFormatted: "0.0%",
      byMethod: [],
    };
  }

  const analytics = await getBatchAnalytics(batch.id);
  const unresolvedPaise = Math.max(0, analytics.valueAtRiskPaise - analytics.recoveredPaise);

  const methodMap = new Map<string, { count: number; valuePaise: number; recoveredPaise: number }>();
  for (const p of batch.payments) {
    const m = p.paymentMethod || "card";
    const curr = methodMap.get(m) || { count: 0, valuePaise: 0, recoveredPaise: 0 };
    curr.count += 1;
    curr.valuePaise += p.amountPaise;
    if (p.status === "recovered") {
      curr.recoveredPaise += p.recoveredAmountPaise || p.amountPaise;
    }
    methodMap.set(m, curr);
  }

  const byMethod = [...methodMap.entries()].map(([method, d]) => ({
    method: method.toUpperCase(),
    count: d.count,
    valuePaise: d.valuePaise,
    recoveredPaise: d.recoveredPaise,
    recoveryRate: d.valuePaise > 0 ? (d.recoveredPaise / d.valuePaise) * 100 : 0,
  }));

  return {
    totalPayments: analytics.totalPayments,
    valueAtRiskPaise: analytics.valueAtRiskPaise,
    valueAtRiskFormatted: formatInrFromPaise(analytics.valueAtRiskPaise),
    recoveredPaise: analytics.recoveredPaise,
    recoveredFormatted: formatInrFromPaise(analytics.recoveredPaise),
    unresolvedPaise,
    unresolvedFormatted: formatInrFromPaise(unresolvedPaise),
    recoveryRate: analytics.recoveryRate,
    recoveryRateFormatted: `${analytics.recoveryRate.toFixed(1)}%`,
    byMethod,
  };
}

// ─── 5. customerRanking() ─────────────────────────────────────────────
export async function customerRanking(
  criterion: "failure_rate" | "value_at_risk" | "recovery_potential" = "failure_rate",
  limit = 10
): Promise<{
  criterion: string;
  customers: {
    id: string;
    name: string;
    segment: SegmentType;
    failureRate: number;
    valueAtRiskPaise: number;
    totalValuePaise: number;
    totalAttempts: number;
    recommendedAction: string;
  }[];
}> {
  const store = await readStore();
  const failures = store.failureEvents.map((f) => ({ paymentId: f.paymentId, category: f.category }));
  const allMetrics = store.customers.map((c) => buildCustomerMetrics(c, store.payments, failures));
  const thresholds = calculateDatasetThresholds(allMetrics);

  const evaluated = allMetrics.map((m) => evaluateCustomerSegmentation(m, thresholds));

  if (criterion === "value_at_risk") {
    evaluated.sort((a, b) => b.customer.valueAtRiskPaise - a.customer.valueAtRiskPaise);
  } else if (criterion === "recovery_potential") {
    evaluated.sort((a, b) => {
      // Prioritize customers with high value and temporary failures
      return b.customer.totalTransactionValuePaise - a.customer.totalTransactionValuePaise;
    });
  } else {
    // failure_rate
    evaluated.sort((a, b) => b.customer.failureRate - a.customer.failureRate);
  }

  const customers = evaluated.slice(0, limit).map((e) => ({
    id: e.customer.customerId,
    name: e.customer.customerName,
    segment: e.primarySegment,
    failureRate: e.customer.failureRate,
    valueAtRiskPaise: e.customer.valueAtRiskPaise,
    totalValuePaise: e.customer.totalTransactionValuePaise,
    totalAttempts: e.customer.totalAttempts,
    recommendedAction: e.recommendedAction.title,
  }));

  return { criterion, customers };
}

// ─── 6. segmentCustomers() ────────────────────────────────────────────
export type SegmentSummary = {
  segment: SegmentType;
  label: string;
  meaning: string;
  count: number;
  percentage: number;
  averageFailureRate: number;
  revenueAtRiskPaise: number;
  color: string;
  customerIds: string[];
};

export type ScatterPlotPoint = {
  customerId: string;
  customerName: string;
  failureRatePct: number;
  totalValueInr: number;
  segment: SegmentType;
  color: string;
  valueAtRiskInr: number;
  totalAttempts: number;
  isLowConfidence: boolean;
};

export async function segmentCustomers(): Promise<{
  thresholds: DatasetThresholds;
  segments: SegmentSummary[];
  scatterData: ScatterPlotPoint[];
  allEvaluated: CustomerSegmentationResult[];
}> {
  const store = await readStore();
  const failures = store.failureEvents.map((f) => ({ paymentId: f.paymentId, category: f.category }));
  const allMetrics = store.customers.map((c) => buildCustomerMetrics(c, store.payments, failures));
  const thresholds = calculateDatasetThresholds(allMetrics);

  const allEvaluated = allMetrics.map((m) => evaluateCustomerSegmentation(m, thresholds));
  const total = allEvaluated.length || 1;

  // Group by primary segment
  const segmentMap: Record<
    SegmentType,
    {
      count: number;
      sumFailureRate: number;
      revenueAtRiskPaise: number;
      customerIds: string[];
    }
  > = {
    "High Risk": { count: 0, sumFailureRate: 0, revenueAtRiskPaise: 0, customerIds: [] },
    "High Failure Frequency": { count: 0, sumFailureRate: 0, revenueAtRiskPaise: 0, customerIds: [] },
    "Recovery on Retry": { count: 0, sumFailureRate: 0, revenueAtRiskPaise: 0, customerIds: [] },
    "High Value": { count: 0, sumFailureRate: 0, revenueAtRiskPaise: 0, customerIds: [] },
    Healthy: { count: 0, sumFailureRate: 0, revenueAtRiskPaise: 0, customerIds: [] },
  };

  const scatterData: ScatterPlotPoint[] = [];

  for (const item of allEvaluated) {
    const seg = item.primarySegment;
    segmentMap[seg].count += 1;
    segmentMap[seg].sumFailureRate += item.customer.failureRate;
    segmentMap[seg].revenueAtRiskPaise += item.customer.valueAtRiskPaise;
    segmentMap[seg].customerIds.push(item.customer.customerId);

    scatterData.push({
      customerId: item.customer.customerId,
      customerName: item.customer.customerName,
      failureRatePct: Number((item.customer.failureRate * 100).toFixed(1)),
      totalValueInr: Math.round(item.customer.totalTransactionValuePaise / 100),
      segment: seg,
      color: SEGMENT_METADATA[seg].color,
      valueAtRiskInr: Math.round(item.customer.valueAtRiskPaise / 100),
      totalAttempts: item.customer.totalAttempts,
      isLowConfidence: item.customer.isLowConfidence,
    });
  }

  const segments: SegmentSummary[] = (
    [
      "High Risk",
      "High Failure Frequency",
      "Recovery on Retry",
      "High Value",
      "Healthy",
    ] as SegmentType[]
  ).map((seg) => {
    const data = segmentMap[seg];
    const meta = SEGMENT_METADATA[seg];
    return {
      segment: seg,
      label: meta.label,
      meaning: meta.description,
      count: data.count,
      percentage: Number(((data.count / total) * 100).toFixed(1)),
      averageFailureRate:
        data.count > 0 ? Number(((data.sumFailureRate / data.count) * 100).toFixed(1)) : 0,
      revenueAtRiskPaise: data.revenueAtRiskPaise,
      color: meta.color,
      customerIds: data.customerIds,
    };
  });

  return { thresholds, segments, scatterData, allEvaluated };
}

// ─── 7. recommendAction(customerId) ───────────────────────────────────
export async function recommendAction(customerId: string): Promise<
  | {
      found: true;
      customer: CustomerMetrics;
      primarySegment: SegmentType;
      strategy: string;
      strategyLabel: string;
      title: string;
      reasoning: string;
      retriesCapStatus: string;
    }
  | { found: false; query: string; closeMatches: { id: string; name?: string }[] }
> {
  const result = await getCustomer(customerId);
  if (!result.found) return result;

  const { customer, primarySegment } = result.customer;
  const { strategy, title, reasoning } = result.customer.recommendedAction;
  const strategyLabel = STRATEGY_LABELS[strategy as keyof typeof STRATEGY_LABELS] || strategy;

  const retriesCapStatus =
    customer.retriesExecuted >= 3
      ? "3 of 3 attempts reached (Cap exhausted — further automated retries blocked)"
      : `${customer.retriesExecuted} of 3 maximum automated attempts used`;

  return {
    found: true,
    customer,
    primarySegment,
    strategy,
    strategyLabel,
    title,
    reasoning,
    retriesCapStatus,
  };
}

export async function executeDeterministicTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "getCustomer":
      return await getCustomer(String(args.customerId || ""));
    case "getPayment":
      return await getPayment(String(args.paymentId || ""));
    case "topFailureReasons":
      return await topFailureReasons();
    case "revenueAtRisk":
      return await revenueAtRisk();
    case "customerRanking":
      return await customerRanking(
        (args.criterion as "failure_rate" | "value_at_risk" | "recovery_potential") || "failure_rate"
      );
    case "segmentCustomers":
      return await segmentCustomers();
    case "recommendAction":
      return await recommendAction(String(args.customerId || ""));
    case "unanswerable":
      return {
        unanswerable: true,
        reason: String(args.reason || "Question cannot be answered from the payment recovery dataset."),
      };
    default:
      throw new Error(`Unauthorized tool call: ${name}`);
  }
}

