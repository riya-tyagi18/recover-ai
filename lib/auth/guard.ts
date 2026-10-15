import { validateSession, getClientIp, getUserAgent } from "@/lib/auth/session";
import { logAuthEvent } from "@/lib/db/auth-store";
import type { User, UserRole } from "@/lib/types";
import { NextResponse } from "next/server";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
    this.name = "AuthError";
  }
}

/**
 * Validate CSRF for state-changing requests.
 */
export function validateCsrf(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  if (!origin || !host) {
    // If running in some local serverless or testing environments without origin, check referer
    const referer = req.headers.get("referer");
    if (!referer) return true; // allow if no origin/referer header sent by same-origin agents
    try {
      const refUrl = new URL(referer);
      return refUrl.host === host;
    } catch {
      return false;
    }
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * Get current authenticated user or null.
 */
export async function getAuthUser(req?: Request): Promise<User | null> {
  const result = await validateSession(req);
  return result?.user ?? null;
}

/**
 * Enforce authentication: throws AuthError(401) if not logged in.
 */
export async function requireAuth(req?: Request): Promise<User> {
  const user = await getAuthUser(req);
  if (!user) {
    throw new AuthError("Unauthorized. Please sign in to continue.", 401);
  }
  return user;
}

/**
 * Enforce role: throws AuthError(401) if not logged in, AuthError(403) if wrong role.
 */
export async function requireRole(
  allowedRoles: UserRole[],
  req?: Request,
): Promise<User> {
  const user = await requireAuth(req);
  if (!allowedRoles.includes(user.role)) {
    if (req) {
      await logAuthEvent({
        userId: user.id,
        event: "access_denied",
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        detail: {
          path: new URL(req.url).pathname,
          requiredRoles: allowedRoles,
          userRole: user.role,
        },
      });
    }
    throw new AuthError(
      "Forbidden. You do not have permission to access this resource.",
      403,
    );
  }
  return user;
}

/**
 * Helper specifically for owner-only resources.
 */
export async function requireOwner(req?: Request): Promise<User> {
  return requireRole(["owner"], req);
}

/**
 * API route wrapper that enforces RBAC and CSRF, returning proper HTTP responses.
 */
export async function withAuth(
  req: Request,
  handler: (user: User) => Promise<Response>,
  allowedRoles?: UserRole[],
): Promise<Response> {
  if (!validateCsrf(req)) {
    return NextResponse.json(
      { error: "Invalid request origin (CSRF protection)." },
      { status: 403 },
    );
  }

  try {
    const user = allowedRoles
      ? await requireRole(allowedRoles, req)
      : await requireAuth(req);
    return await handler(user);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unhandled error in withAuth handler:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 },
    );
  }
}
