/**
 * Customer Risk Segmentation Config & Rule Engine.
 * 
 * Transparent rule definitions computed per customer from the dataset.
 * Uses relative thresholds (quartiles, medians) so classifications adapt to the data.
 * Priority order: High Risk > High Failure Frequency > Recovery on Retry > High Value > Healthy.
 */

import { formatInrFromPaise } from "@/lib/format";
import type { Customer, Payment } from "@/lib/types";

export type SegmentType =
  | "High Risk"
  | "High Failure Frequency"
  | "Recovery on Retry"
  | "High Value"
  | "Healthy";

export const SEGMENT_PRIORITY: SegmentType[] = [
  "High Risk",
  "High Failure Frequency",
  "Recovery on Retry",
  "High Value",
  "Healthy",
];

export const SEGMENT_METADATA: Record<
  SegmentType,
  {
    label: string;
    description: string;
    color: string;
    bgClass: string;
    badgeClass: string;
  }
> = {
  "High Risk": {
    label: "High Risk",
    description: "Unresolved failed value above threshold or retries exhausted without recovery.",
    color: "#943232",
    bgClass: "bg-red-50/50 border-red-200/60",
    badgeClass: "badge-stopped",
  },
  "High Failure Frequency": {
    label: "High Failure Frequency",
    description: "Payment failure rate above dataset median with repeated transaction failures.",
    color: "#b45309",
    bgClass: "bg-amber-50/50 border-amber-200/60",
    badgeClass: "badge-at-risk",
  },
  "Recovery on Retry": {
    label: "Recovery on Retry",
    description: "At least 2 failures with over 50% successfully resolved on automated retry.",
    color: "#3b5998",
    bgClass: "bg-blue-50/50 border-blue-200/60",
    badgeClass: "badge-pending",
  },
  "High Value": {
    label: "High Value",
    description: "Customer transaction value in top quartile of the dataset.",
    color: "#1e7054",
    bgClass: "bg-emerald-50/50 border-emerald-200/60",
    badgeClass: "badge-recovered",
  },
  Healthy: {
    label: "Healthy",
    description: "Low failure rate, no unresolved exposure, and consistent payment history.",
    color: "#4d7c67",
    bgClass: "bg-surface border-border",
    badgeClass: "badge-recovered",
  },
};

export type CustomerMetrics = {
  customerId: string;
  customerName: string;
  totalAttempts: number;
  totalFailures: number;
  failureRate: number; // 0.0 to 1.0
  totalTransactionValuePaise: number;
  valueAtRiskPaise: number;
  recoveredPaise: number;
  retriesExecuted: number;
  recoveredByRetryCount: number;
  retriesExhaustedWithoutRecovery: boolean;
  isLowConfidence: boolean; // < 3 attempts recorded
  confidenceReason?: string;
  topFailureReasons: string[];
};

export type CustomerSegmentationResult = {
  customer: CustomerMetrics;
  primarySegment: SegmentType;
  allTags: SegmentType[];
  rulesTriggered: Record<SegmentType, string[]>;
  recommendedAction: {
    strategy: string;
    title: string;
    reasoning: string;
  };
};

export type DatasetThresholds = {
  topQuartileValuePaise: number;
  medianFailureRate: number;
  unresolvedValueThresholdPaise: number;
  totalCustomers: number;
};

/**
 * Calculates dataset-relative thresholds (quartiles, medians).
 */
export function calculateDatasetThresholds(customerMetrics: CustomerMetrics[]): DatasetThresholds {
  const n = customerMetrics.length;
  if (n === 0) {
    return {
      topQuartileValuePaise: 0,
      medianFailureRate: 0.3,
      unresolvedValueThresholdPaise: 0,
      totalCustomers: 0,
    };
  }

  // 1. Top-quartile transaction value (75th percentile)
  const sortedValues = customerMetrics
    .map((c) => c.totalTransactionValuePaise)
    .sort((a, b) => a - b);
  const q75Index = Math.floor(n * 0.75);
  const topQuartileValuePaise = sortedValues[q75Index] ?? 0;

  // 2. Median failure rate (50th percentile)
  const sortedFailureRates = customerMetrics
    .map((c) => c.failureRate)
    .sort((a, b) => a - b);
  const medianIndex = Math.floor(n * 0.5);
  const medianFailureRate = sortedFailureRates[medianIndex] ?? 0.25;

  // 3. Unresolved value threshold (median of positive unresolved values)
  const unresolvedValues = customerMetrics
    .map((c) => c.valueAtRiskPaise)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const unresolvedThreshold =
    unresolvedValues.length > 0
      ? unresolvedValues[Math.floor(unresolvedValues.length * 0.5)]
      : 0;

  return {
    topQuartileValuePaise,
    medianFailureRate,
    unresolvedValueThresholdPaise: unresolvedThreshold,
    totalCustomers: n,
  };
}

/**
 * Evaluates segmentation rules for a single customer against dataset thresholds.
 */
export function evaluateCustomerSegmentation(
  metrics: CustomerMetrics,
  thresholds: DatasetThresholds
): CustomerSegmentationResult {
  const rulesTriggered: Record<SegmentType, string[]> = {
    "High Risk": [],
    "High Failure Frequency": [],
    "Recovery on Retry": [],
    "High Value": [],
    Healthy: [],
  };

  // ─── Rule 1: High Risk ───────────────────────────────────────────
  // Unresolved failed value above threshold OR retries exhausted without recovery
  if (
    metrics.valueAtRiskPaise > 0 &&
    metrics.valueAtRiskPaise >= thresholds.unresolvedValueThresholdPaise
  ) {
    rulesTriggered["High Risk"].push(
      `Unresolved failed value (${formatInrFromPaise(
        metrics.valueAtRiskPaise
      )}) reaches or exceeds dataset threshold (${formatInrFromPaise(
        thresholds.unresolvedValueThresholdPaise
      )}).`
    );
  }
  if (metrics.retriesExhaustedWithoutRecovery) {
    rulesTriggered["High Risk"].push(
      "Automated retries exhausted (reached 3-attempt maximum) without successful recovery."
    );
  }

  // ─── Rule 2: High Failure Frequency ──────────────────────────────
  // Failure rate above dataset median with at least 2 recorded failures
  if (metrics.totalFailures >= 2 && metrics.failureRate >= thresholds.medianFailureRate) {
    rulesTriggered["High Failure Frequency"].push(
      `Failure rate (${(metrics.failureRate * 100).toFixed(
        1
      )}%) is at or above dataset median (${(thresholds.medianFailureRate * 100).toFixed(
        1
      )}%) across ${metrics.totalFailures} failures.`
    );
  }

  // ─── Rule 3: Recovery on Retry ───────────────────────────────────
  // At least 2 failures and at least 50% recovered by retry
  if (
    metrics.totalFailures >= 2 &&
    metrics.recoveredByRetryCount > 0 &&
    metrics.recoveredByRetryCount / metrics.totalFailures >= 0.5
  ) {
    const recoveryRate = Math.round(
      (metrics.recoveredByRetryCount / metrics.totalFailures) * 100
    );
    rulesTriggered["Recovery on Retry"].push(
      `${metrics.recoveredByRetryCount} of ${metrics.totalFailures} failed payments (${recoveryRate}%) were successfully recovered upon retry.`
    );
  }

  // ─── Rule 4: High Value ──────────────────────────────────────────
  // Total transaction value in top quartile
  if (metrics.totalTransactionValuePaise >= thresholds.topQuartileValuePaise) {
    rulesTriggered["High Value"].push(
      `Total transaction value (${formatInrFromPaise(
        metrics.totalTransactionValuePaise
      )}) is in the top quartile of the dataset (>= ${formatInrFromPaise(
        thresholds.topQuartileValuePaise
      )}).`
    );
  }

  // ─── Rule 5: Healthy ─────────────────────────────────────────────
  // None of the risk tags triggered and consistent history
  const hasRiskTags =
    rulesTriggered["High Risk"].length > 0 ||
    rulesTriggered["High Failure Frequency"].length > 0;

  if (
    !hasRiskTags &&
    rulesTriggered["Recovery on Retry"].length === 0 &&
    metrics.valueAtRiskPaise === 0
  ) {
    rulesTriggered["Healthy"].push(
      "Reliable transaction history with no outstanding value at risk and low failure incidence."
    );
  }

  // Determine all triggered tags
  const allTags = SEGMENT_PRIORITY.filter((seg) => rulesTriggered[seg].length > 0);

  // If no tag triggered (e.g. edge cases), fallback to Healthy
  if (allTags.length === 0) {
    allTags.push("Healthy");
    rulesTriggered["Healthy"].push("Standard baseline payment history.");
  }

  // Primary segment by priority order:
  // High Risk > High Failure Frequency > Recovery on Retry > High Value > Healthy
  const primarySegment =
    SEGMENT_PRIORITY.find((seg) => allTags.includes(seg)) ?? "Healthy";

  // Recommended next action tied to recovery strategies & 3-attempt limit
  const recommendedAction = generateRecommendedAction(metrics, primarySegment);

  return {
    customer: metrics,
    primarySegment,
    allTags,
    rulesTriggered,
    recommendedAction,
  };
}

/**
 * Generates actionable next recommendation strictly tied to recovery strategies
 * and the 3-attempt safety cap.
 */
function generateRecommendedAction(
  metrics: CustomerMetrics,
  primarySegment: SegmentType
): {
  strategy: string;
  title: string;
  reasoning: string;
} {
  if (metrics.retriesExhaustedWithoutRecovery) {
    return {
      strategy: "manual_review",
      title: "Escalate to Manual Operations Review",
      reasoning:
        "The 3-attempt automated retry cap has been reached without recovery. Further automated charges are paused to protect against payment gateway penalties. A support agent should contact the customer directly.",
    };
  }

  if (metrics.topFailureReasons.some((r) => r.toLowerCase().includes("expired") || r.toLowerCase().includes("incorrect"))) {
    return {
      strategy: "alt_payment_request",
      title: "Send Payment Update Request (Link)",
      reasoning:
        "A permanent credential failure (expired card or incorrect details) was detected. Automated retries cannot succeed without updated card credentials; dispatch an update link via SMS/WhatsApp.",
    };
  }

  if (primarySegment === "High Risk" || primarySegment === "High Value") {
    if (metrics.valueAtRiskPaise > 0) {
      return {
        strategy: "nudge_then_retry",
        title: "Customer Nudge + Scheduled Retry",
        reasoning:
          "High-exposure account with temporary failure. Dispatch a polite Hinglish balance notification, followed by an automated retry timed for the evening liquidity window (18:00–21:00).",
      };
    }
  }

  if (primarySegment === "Recovery on Retry") {
    return {
      strategy: "delayed_retry",
      title: "Automated Delayed Retry",
      reasoning:
        "Customer shows a documented pattern of resolving temporary payment failures on automated retry. Schedule a standard delayed retry within the optimal 12–24h window.",
    };
  }

  if (metrics.valueAtRiskPaise > 0) {
    return {
      strategy: "immediate_retry",
      title: "Network Retry Window",
      reasoning:
        "Temporary bank or gateway interruption detected. Attempt immediate automated retry before escalating to customer nudges.",
    };
  }

  return {
    strategy: "none",
    title: "Account in Good Standing",
    reasoning:
      "All recent transactions are either settled or successfully recovered. No active recovery intervention required.",
  };
}
