/**
 * Pure-TS in-process recovery agent — mirrors services/agent/graph.py exactly.
 * Used as the primary (and fallback) agent when Python backend is unavailable.
 */
import type { Customer, FailureEvent, Payment } from "@/lib/types";

const PERMANENT_CATEGORIES = new Set(["card_expired", "incorrect_details"]);
const MAX_AUTOMATED_ATTEMPTS = 3;
const RECOVERY_PROBABILITY_THRESHOLD = 15;

export type AgentResult = {
  diagnosis: {
    is_permanent: boolean;
    confidence: number;
    recommended_window: string;
    reasoning: string;
  };
  probability: number;
  probability_breakdown: Record<string, number>;
  strategy: string;
  retry_timing: string;
  action_result: { executed_at: string; source: string; outcome: string };
  is_stopped: boolean;
  stop_reason: string | null;
  audit_logs: Array<{ at: string; action: string; reason: string; detail: unknown }>;
};

export function runAgent(
  payment: Payment,
  customer: Customer,
  failure: FailureEvent,
): AgentResult {
  const now = () => new Date().toISOString();
  const logs: AgentResult["audit_logs"] = [];
  const audit = (action: string, reason: string, detail: unknown) =>
    logs.push({ at: now(), action, reason, detail });

  // diagnose
  const isPermanent = PERMANENT_CATEGORIES.has(failure.category);
  const diagnosis = {
    is_permanent: isPermanent,
    confidence: 0.95,
    recommended_window: isPermanent ? "none" : "2-24h",
    reasoning: `Category '${failure.category}' is considered ${isPermanent ? "permanent" : "temporary"}.`,
  };
  audit("diagnosed", "Completed diagnosis", diagnosis);

  // calculate_probability
  let prob = 50;
  const breakdown: Record<string, number> = { base: 50 };
  if (isPermanent) { prob -= 50; breakdown.permanent_failure = -50; }
  else { prob += 20; breakdown.temporary_failure = 20; }
  if ((customer.priorSuccessRate ?? 0) > 0.8) { prob += 20; breakdown.high_prior_success = 20; }
  if (customer.segment === "at_risk") { prob -= 40; breakdown.at_risk_segment = -40; }
  const priorPenalty = (payment.priorFailureCount ?? 0) * 15;
  if (priorPenalty) { prob -= priorPenalty; breakdown.prior_failures_penalty = -priorPenalty; }
  const retryPenalty = (payment.retryCount ?? 0) * 15;
  if (retryPenalty) { prob -= retryPenalty; breakdown.retry_count_penalty = -retryPenalty; }
  const probability = Math.max(0, Math.min(100, prob));
  audit("probability_calculated", `Calculated ${probability}%`, breakdown);

  // select_strategy
  const strategy =
    probability >= 70 ? "immediate_retry" :
    probability >= 30 ? "delayed_retry" :
    "alt_payment_request";
  audit("strategy_selected", `Selected ${strategy}`, { strategy });

  // determine_timing
  const retry_timing =
    strategy === "immediate_retry" ? "now" :
    strategy === "delayed_retry" ? "+12h" : "never";
  audit("timing_selected", `Selected ${retry_timing}`, { retry_timing });

  // execute
  const outcome =
    strategy === "immediate_retry" || strategy === "delayed_retry"
      ? probability >= 50 ? "success" : "failed"
      : "skipped";
  const action_result = { executed_at: now(), source: "simulation", outcome };
  audit("action_executed", `Execution outcome: ${outcome}`, action_result);

  // should_stop
  const isRecovered = outcome === "success";
  const requiresAlt = strategy === "alt_payment_request";
  const automatedAttempts = (payment.retryCount ?? 0) + 1;
  let is_stopped = false;
  let stop_reason: string | null = null;

  if (isRecovered) { is_stopped = true; stop_reason = "recovered"; }
  else if (isPermanent) { is_stopped = true; stop_reason = "permanent_failure"; }
  else if (probability < RECOVERY_PROBABILITY_THRESHOLD) { is_stopped = true; stop_reason = "probability_below_threshold"; }
  else if (requiresAlt) { is_stopped = true; stop_reason = "alt_method_required"; }
  else if ((payment.priorFailureCount ?? 0) >= 3) { is_stopped = true; stop_reason = "manual_review"; }
  else if (automatedAttempts >= MAX_AUTOMATED_ATTEMPTS) { is_stopped = true; stop_reason = "max_attempts"; }

  audit("result_observed", is_stopped ? "Agent stopped" : "Agent continuing", { is_stopped, stop_reason });
  return { diagnosis, probability, probability_breakdown: breakdown, strategy, retry_timing, action_result, is_stopped, stop_reason, audit_logs: logs };
}

