import { NextResponse } from "next/server";
import crypto from "crypto";
import { validatePassword, hashPassword } from "@/lib/auth/password";
import {
  findPasswordReset,
  markPasswordResetUsed,
  findUserById,
  updateUser,
  deleteUserSessions,
  logAuthEvent,
} from "@/lib/db/auth-store";
import { checkIpRateLimit, uniformTiming } from "@/lib/auth/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limit: max 10 reset attempts per minute per IP
  const ipLimit = await checkIpRateLimit(ip, "reset-password", 10, 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { token, newPassword } = body;

    if (!token || typeof token !== "string" || !newPassword || typeof newPassword !== "string") {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Token and new password are required." },
        { status: 400 },
      );
    }

    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) {
      await uniformTiming(startTime);
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    const hashedToken = crypto.createHash("sha256").update(token.trim()).digest("hex");
    const record = await findPasswordReset(hashedToken);

    if (!record || record.used || new Date(record.expiresAt) <= new Date()) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired. Please request a new one." },
        { status: 400 },
      );
    }

    const user = await findUserById(record.userId);
    if (!user) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Account could not be found. Please sign up or contact support." },
        { status: 400 },
      );
    }

    // Hash with bcrypt cost 12
    const passwordHash = await hashPassword(newPassword);

    // Update password, reset lockouts and failed attempts
    await updateUser(user.id, {
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
    });

    // Mark single-use token as used
    await markPasswordResetUsed(hashedToken);

    // CRITICAL: Invalidate ALL existing sessions for this user so old cookies stop working
    await deleteUserSessions(user.id);

    await logAuthEvent({
      userId: user.id,
      event: "password.reset_success",
      ip,
      userAgent,
      detail: { email: user.email },
    });

    await uniformTiming(startTime);

    return NextResponse.json({
      message: "Your password has been successfully reset. Please sign in with your new password.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    await uniformTiming(startTime);
    return NextResponse.json(
      { error: "Failed to reset password. Please try again." },
      { status: 500 },
    );
  }
}
