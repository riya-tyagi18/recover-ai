import crypto from "crypto";
import { cookies } from "next/headers";
import {
  createSession as dbCreateSession,
  findSessionById,
  updateSessionActivity,
  deleteSession as dbDeleteSession,
  findUserById,
} from "@/lib/db/auth-store";
import type { Session, User } from "@/lib/types";

export const SESSION_COOKIE_NAME = "rai_session";
export const SESSION_DURATION_HOURS = 8;
export const SESSION_DURATION_MS = SESSION_DURATION_HOURS * 60 * 60 * 1000;

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getClientIp(req?: Request): string {
  if (!req) return "127.0.0.1";
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "127.0.0.1";
}

export function getUserAgent(req?: Request): string {
  if (!req) return "unknown";
  return req.headers.get("user-agent") || "unknown";
}

/**
 * Create a new server-side session and return the raw unhashed token for the client cookie.
 */
export async function createSession(
  userId: string,
  req?: Request,
): Promise<{ rawToken: string; session: Session }> {
  const rawToken = generateSessionToken();
  const hashedToken = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();

  const session: Session = {
    id: hashedToken,
    userId,
    createdAt: now.toISOString(),
    expiresAt,
    lastActiveAt: now.toISOString(),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };

  await dbCreateSession(session);
  return { rawToken, session };
}

/**
 * Extract raw session token from request or next/headers cookies.
 */
export async function getSessionTokenFromRequest(req?: Request): Promise<string | null> {
  if (req) {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
      if (match) {
        return decodeURIComponent(match.substring(SESSION_COOKIE_NAME.length + 1));
      }
    }
  }

  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE_NAME);
    return cookie?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Validate session from request or cookies.
 * Handles sliding idle expiration and returns user if valid.
 */
export async function validateSession(
  req?: Request,
): Promise<{ session: Session; user: User } | null> {
  const rawToken = await getSessionTokenFromRequest(req);
  if (!rawToken) return null;

  const hashedToken = hashToken(rawToken);
  const session = await findSessionById(hashedToken);
  if (!session) return null;

  const now = new Date();
  if (new Date(session.expiresAt) <= now) {
    // Expired
    await dbDeleteSession(hashedToken);
    return null;
  }

  // Sliding idle timeout: extend expiry by 8 hours from now
  const newExpiry = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
  // Update if lastActiveAt was more than 2 minutes ago to avoid excessive DB writes
  const lastActive = new Date(session.lastActiveAt).getTime();
  if (now.getTime() - lastActive > 2 * 60 * 1000) {
    await updateSessionActivity(hashedToken, newExpiry);
    session.expiresAt = newExpiry;
    session.lastActiveAt = now.toISOString();
  }

  const user = await findUserById(session.userId);
  if (!user) {
    await dbDeleteSession(hashedToken);
    return null;
  }

  return { session, user };
}

/**
 * Invalidate session server-side (logout)
 */
export async function destroySession(req?: Request): Promise<void> {
  const rawToken = await getSessionTokenFromRequest(req);
  if (rawToken) {
    const hashedToken = hashToken(rawToken);
    await dbDeleteSession(hashedToken);
  }

  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {
    // If running in context without cookieStore set capability, ignore
  }
}
