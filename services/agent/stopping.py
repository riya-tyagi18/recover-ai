MAX_AUTOMATED_ATTEMPTS = 3
RECOVERY_PROBABILITY_THRESHOLD = 15

STOP_REASON_LABELS = {
    "max_attempts": "Stopped: reached the maximum of 3 automated recovery attempts.",
    "probability_below_threshold": "Stopped: recovery probability fell below the 15% threshold.",
    "permanent_failure": "Stopped: failure classified as permanent; automated retry will not succeed.",
    "alt_method_required": "Stopped: a new payment method is required before further attempts.",
    "recovered": "Stopped: payment recovered successfully.",
    "manual_review": "Stopped: flagged for manual review (3+ prior failures).",
}


def should_stop(
    *,
    automated_attempts: int,
    recovery_probability: int | None,
    is_permanent: bool,
    requires_alt_method: bool,
    is_recovered: bool,
    prior_failure_count: int,
) -> tuple[bool, str | None]:
    """Single code path that prevents infinite retries. Keep in sync with lib/stopping.ts."""
    if is_recovered:
        return True, "recovered"
    if is_permanent:
        return True, "permanent_failure"
    if (
        recovery_probability is not None
        and recovery_probability < RECOVERY_PROBABILITY_THRESHOLD
    ):
        return True, "probability_below_threshold"
    if requires_alt_method:
        return True, "alt_method_required"
    if prior_failure_count >= 3:
        return True, "manual_review"
    if automated_attempts >= MAX_AUTOMATED_ATTEMPTS:
        return True, "max_attempts"
    return False, None
