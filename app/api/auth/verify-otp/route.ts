import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import {
  findLatestEmailOtp,
  incrementOtpAttempts,
  markOtpUsed,
  findUserById,
  logAuthEvent,
} from "@/lib/db/auth-store";
import { createSession, getClientIp, getUserAgent, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkIpRateLimit, recordSuccessfulLogin, uniformTiming } from "@/lib/auth/rate-limit";
import { validateCsrf } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limit: max 15 attempts per minute per IP
  const ipLimit = await checkIpRateLimit(ip, "verify-otp", 15, 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { userId, code } = body;

    if (!userId || !code || typeof code !== "string") {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "User ID and 6-digit verification code are required." },
        { status: 400 },
      );
    }

    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Verification code must be exactly 6 digits." },
        { status: 400 },
      );
    }

    const otp = await findLatestEmailOtp(userId);
    if (!otp) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Verification code has expired or was not found. Please sign in again." },
        { status: 400 },
      );
    }

    if (otp.attempts >= 5) {
      await markOtpUsed(otp.id);
      await logAuthEvent({
        userId,
        event: "otp.exceeded",
        ip,
        userAgent,
        detail: { reason: "Maximum attempt limit (5) reached" },
      });
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Too many incorrect attempts. This code is invalidated. Please sign in again." },
        { status: 429 },
      );
    }

    const submittedHash = crypto.createHash("sha256").update(cleanCode).digest("hex");
    if (submittedHash !== otp.codeHash) {
      const attempts = await incrementOtpAttempts(otp.id);
      await logAuthEvent({
        userId,
        event: "otp.failed",
        ip,
        userAgent,
        detail: { attempts: attempts + 1 },
      });
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Invalid verification code. Please check and try again." },
        { status: 400 },
      );
    }

    // Code matches: single-use invalidation
    await markOtpUsed(otp.id);
    const user = await findUserById(userId);
    if (!user) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Account not found. Please sign in again." },
        { status: 400 },
      );
    }

    await recordSuccessfulLogin(user, ip, userAgent);
    await logAuthEvent({
      userId,
      event: "otp.verified",
      ip,
      userAgent,
      detail: { role: user.role },
    });

    const { rawToken } = await createSession(user.id, request);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    await uniformTiming(startTime);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        customerId: user.customerId,
      },
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    await uniformTiming(startTime);
    return NextResponse.json(
      { error: "Failed to verify code. Please try again." },
      { status: 500 },
    );
  }
}
