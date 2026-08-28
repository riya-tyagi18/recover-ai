export const FAILURE_CATEGORIES = [
  "insufficient_funds",
  "card_expired",
  "card_declined",
  "bank_issue",
  "network_temporary",
  "gateway_issue",
  "incorrect_details",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const CUSTOMER_SEGMENTS = [
  "high_value",
  "standard",
  "at_risk",
  "new",
] as const;

export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const PAYMENT_METHODS = ["card", "upi", "netbanking", "wallet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STRATEGIES = [
  "immediate_retry",
  "delayed_retry",
  "nudge_then_retry",
  "alt_payment_request",
] as const;

export type StrategyId = (typeof STRATEGIES)[number];

export const PAYMENT_STATUSES = [
  "failed",
  "recovering",
  "recovered",
  "stopped",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type Customer = {
  id: string;
  name: string;
  segment: CustomerSegment;
  priorSuccessCount: number;
  priorSuccessRate: number;
  paymentMethod: PaymentMethod;
  bank: string;
  createdAt: string;
};

export type Payment = {
  id: string;
  customerId: string;
  batchId: string;
  subscriptionId: string;
  amountPaise: number;
  currency: "INR";
  paymentMethod: PaymentMethod;
  bank: string;
  retryCount: number;
  priorFailureCount: number;
  status: PaymentStatus;
  recoveredAmountPaise: number;
  recoveredAt: string | null;
  stopReason: string | null;
  subscriptionValuePaise: number;
  failedAt: string;
  assignedStrategy: StrategyId;
};

export type FailureEvent = {
  id: string;
  paymentId: string;
  reason: string;
  category: FailureCategory;
  occurredAt: string;
};

export type PaymentAttempt = {
  id: string;
  paymentId: string;
  attemptNumber: number;
  scheduledFor: string;
  executedAt: string | null;
  outcome: "pending" | "success" | "failed" | "skipped";
  source: "simulation" | "razorpay_test";
  reason: string;
};

export type RecoveryDecision = {
  id: string;
  paymentId: string;
  runId: string;
  diagnosisJson: unknown;
  probability: number;
  probabilityBreakdown: unknown;
  strategy: StrategyId;
  retryTiming: string;
  createdAt: string;
};

export type RecoveryAction = {
  id: string;
  paymentId: string;
  decisionId: string;
  actionType: string;
  payload: unknown;
  source: "simulation" | "razorpay_test";
  result: unknown;
  createdAt: string;
};

export type AgentRun = {
  id: string;
  runType: "seed" | "recovery";
  seed: number | null;
  paymentCount: number;
  status: "generated" | "running" | "paused" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  parentBatchId: string | null;
};

export type AbExperiment = {
  id: string;
  name: string;
  strategies: StrategyId[];
  createdAt: string;
};

export type ExperimentAssignment = {
  id: string;
  experimentId: string;
  paymentId: string;
  strategy: StrategyId;
};

export type AuditLog = {
  id: string;
  paymentId: string | null;
  runId: string | null;
  at: string;
  action: string;
  reason: string;
  detail: unknown;
};

export const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  insufficient_funds: "Insufficient funds",
  card_expired: "Card expired",
  card_declined: "Card declined",
  bank_issue: "Bank issue",
  network_temporary: "Network / temporary",
  gateway_issue: "Gateway issue",
  incorrect_details: "Incorrect details",
};

export const STRATEGY_LABELS: Record<StrategyId, string> = {
  immediate_retry: "Immediate retry",
  delayed_retry: "Delayed retry",
  nudge_then_retry: "Nudge + retry",
  alt_payment_request: "Alt payment request",
};

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  high_value: "High value",
  standard: "Standard",
  at_risk: "At risk",
  new: "New",
};
