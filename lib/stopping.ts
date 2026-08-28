/**
 * Hard stopping rules for the recovery agent.
 * Judges: this is the code path that prevents infinite retries.
 */
export const MAX_AUTOMATED_ATTEMPTS = 3;
export const RECOVERY_PROBABILITY_THRESHOLD = 15;

export const STOP_REASONS = [
  "max_attempts",
  "probability_below_threshold",
  "permanent_failure",
  "alt_method_required",
  "recovered",
  "manual_review",
] as const;

export type StopReason = (typeof STOP_REASONS)[number];

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  max_attempts:
    "Stopped: reached the maximum of 3 automated recovery attempts.",
  probability_below_threshold:
    "Stopped: recovery probability fell below the 15% threshold.",
  permanent_failure:
    "Stopped: failure classified as permanent; automated retry will not succeed.",
  alt_method_required:
    "Stopped: a new payment method is required before further attempts.",
  recovered: "Stopped: payment recovered successfully.",
  manual_review: "Stopped: flagged for manual review (3+ prior failures).",
};

export function shouldStop(input: {
  automatedAttempts: number;
  recoveryProbability: number | null;
  isPermanent: boolean;
  requiresAltMethod: boolean;
  isRecovered: boolean;
  priorFailureCount: number;
}): { stop: boolean; reason: StopReason | null } {
  if (input.isRecovered) {
    return { stop: true, reason: "recovered" };
  }
  if (input.isPermanent) {
    return { stop: true, reason: "permanent_failure" };
  }
  if (input.requiresAltMethod) {
    return { stop: true, reason: "alt_method_required" };
  }
  if (input.priorFailureCount >= 3) {
    return { stop: true, reason: "manual_review" };
  }
  if (input.automatedAttempts >= MAX_AUTOMATED_ATTEMPTS) {
    return { stop: true, reason: "max_attempts" };
  }
  if (
    input.recoveryProbability !== null &&
    input.recoveryProbability < RECOVERY_PROBABILITY_THRESHOLD
  ) {
    return { stop: true, reason: "probability_below_threshold" };
  }
  return { stop: false, reason: null };
}
