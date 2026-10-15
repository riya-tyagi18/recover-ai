import { checkAndIncrementRateLimit, updateUser, logAuthEvent } from "@/lib/db/auth-store";
import type { User } from "@/lib/types";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
export const IP_WINDOW_MS = 60 * 1000; // 1 minute
export const IP_MAX_ATTEMPTS = 20;

/**
 * Check DB-backed rate limit for an IP address.
 */
export async function checkIpRateLimit(
  ip: string,
  action: string,
  maxAttempts = IP_MAX_ATTEMPTS,
  windowMs = IP_WINDOW_MS,
): Promise<{ allowed: boolean; remaining: number; error?: string }> {
  const key = `ratelimit:ip:${action}:${ip}`;
  const res = await checkAndIncrementRateLimit(key, maxAttempts, windowMs);
  if (!res.allowed) {
    return {
      allowed: false,
      remaining: 0,
      error: "Too many requests from your IP address. Please wait a moment before trying again.",
    };
  }
  return { allowed: true, remaining: res.remaining };
}

/**
 * Check if a user account is currently locked out.
 * Automatically clears lockout if the lockout period has expired.
 */
export async function isAccountLocked(user: User): Promise<boolean> {
  if (!user.lockedUntil) return false;

  const now = new Date();
  const lockedUntil = new Date(user.lockedUntil);

  if (now < lockedUntil) {
    return true; // Still locked
  }

  // Lockout expired, reset attempts and lockout
  await updateUser(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
  });
  user.failedAttempts = 0;
  user.lockedUntil = null;
  return false;
}

/**
 * Record a failed login attempt for a user.
 * After 5 attempts, locks the account for 15 minutes.
 */
export async function recordFailedLogin(
  user: User | null,
  ip: string,
  userAgent: string,
): Promise<{ locked: boolean; lockedUntil: string | null }> {
  if (!user) {
    await logAuthEvent({
      userId: null,
      event: "login.failure",
      ip,
      userAgent,
      detail: { reason: "User not found" },
    });
    return { locked: false, lockedUntil: null };
  }

  const nextAttempts = user.failedAttempts + 1;
  let lockedUntil: string | null = null;
  let locked = false;

  if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
    locked = true;
    lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    await updateUser(user.id, {
      failedAttempts: nextAttempts,
      lockedUntil,
    });
    await logAuthEvent({
      userId: user.id,
      event: "lockout",
      ip,
      userAgent,
      detail: { failedAttempts: nextAttempts, lockedUntil },
    });
  } else {
    await updateUser(user.id, {
      failedAttempts: nextAttempts,
    });
    await logAuthEvent({
      userId: user.id,
      event: "login.failure",
      ip,
      userAgent,
      detail: { failedAttempts: nextAttempts },
    });
  }

  return { locked, lockedUntil };
}

/**
 * Record a successful login: resets failed attempts and lockout.
 */
export async function recordSuccessfulLogin(
  user: User,
  ip: string,
  userAgent: string,
): Promise<void> {
  await updateUser(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
  });
  await logAuthEvent({
    userId: user.id,
    event: "login.success",
    ip,
    userAgent,
    detail: { email: user.email, role: user.role },
  });
}

/**
 * Enforce slightly uniform response timing to resist timing attacks.
 */
export async function uniformTiming(startTime: number, targetMs = 250): Promise<void> {
  const elapsed = Date.now() - startTime;
  const remaining = targetMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
