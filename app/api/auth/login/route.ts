import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { dummyVerify, verifyPassword } from "@/lib/auth/password";
import { findUserByEmail, createEmailOtp } from "@/lib/db/auth-store";
import { createSession, getClientIp, getUserAgent, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import {
  checkIpRateLimit,
  isAccountLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
  uniformTiming,
} from "@/lib/auth/rate-limit";
import { validateCsrf } from "@/lib/auth/guard";
import {
  isDemoMode,
  seedAuthAccounts,
  DEMO_OWNER_ALIAS,
  DEMO_OWNER_EMAIL,
  DEMO_CUSTOMER_ALIAS,
  DEMO_CUSTOMER_EMAIL,
} from "@/lib/auth/seed";
import { hasMailProvider, sendEmail } from "@/lib/auth/mail";
import type { User } from "@/lib/types";

/** Reusable response helpers — keeps the error strings in one place */
const badCredentials = (startTime: number) =>
  uniformTiming(startTime).then(() =>
    NextResponse.json({ error: "Incorrect username or password." }, { status: 401 })
  );

const serverError = (startTime: number, err: unknown) => {
  console.error("[login] database / internal error:", err);
  return uniformTiming(startTime).then(() =>
    NextResponse.json(
      { error: "Something went wrong, please try again." },
      { status: 500 }
    )
  );
};

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limit: max 20 login attempts per minute per IP
  let ipLimit: { allowed: boolean; remaining: number; error?: string };
  try {
    ipLimit = await checkIpRateLimit(ip, "login", 20, 60 * 1000);
  } catch (err) {
    return serverError(startTime, err);
  }
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  // Parse body
  const body = await request.json().catch(() => ({}));
  const { email, password } = body as { email?: unknown; password?: unknown };

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    await uniformTiming(startTime);
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  let searchEmail = email.trim().toLowerCase();
  const demo = isDemoMode();

  // Map shorthand aliases to real emails (demo mode only)
  if (demo) {
    if (searchEmail === DEMO_OWNER_ALIAS) searchEmail = DEMO_OWNER_EMAIL;
    else if (searchEmail === DEMO_CUSTOMER_ALIAS) searchEmail = DEMO_CUSTOMER_EMAIL;
  } else {
    // In production (DEMO_MODE=false/unset) reject bare aliases
    if (searchEmail === DEMO_OWNER_ALIAS || searchEmail === DEMO_CUSTOMER_ALIAS) {
      await dummyVerify(password);
      return badCredentials(startTime);
    }
  }

  // ── Look up user (DB errors → 500, not 401) ──────────────────────────────
  let user: User | null;
  try {
    user = await findUserByEmail(searchEmail);
  } catch (err) {
    return serverError(startTime, err);
  }

  // Auto-seed demo accounts on first login attempt if they don't exist yet
  if (!user && demo && (searchEmail === DEMO_OWNER_EMAIL || searchEmail === DEMO_CUSTOMER_EMAIL)) {
    try {
      await seedAuthAccounts();
      user = await findUserByEmail(searchEmail);
    } catch (err) {
      return serverError(startTime, err);
    }
  }

  // Unknown user
  if (!user) {
    await dummyVerify(password); // constant-time
    try { await recordFailedLogin(null, ip, userAgent); } catch { /* audit failure is non-fatal */ }
    return badCredentials(startTime);
  }

  // ── Lockout check ─────────────────────────────────────────────────────────
  let locked: boolean;
  try {
    locked = await isAccountLocked(user);
  } catch (err) {
    return serverError(startTime, err);
  }
  if (locked) {
    await dummyVerify(password);
    await uniformTiming(startTime);
    return NextResponse.json(
      { error: "This account has been temporarily locked due to too many failed attempts. Please try again in 15 minutes." },
      { status: 429 }
    );
  }

  // ── Verify password ───────────────────────────────────────────────────────
  let passwordValid: boolean;
  try {
    passwordValid = await verifyPassword(password, user.passwordHash);
  } catch (err) {
    return serverError(startTime, err);
  }

  if (!passwordValid) {
    let lockResult: { locked: boolean; lockedUntil: string | null } = { locked: false, lockedUntil: null };
    try { lockResult = await recordFailedLogin(user, ip, userAgent); } catch { /* audit failure is non-fatal */ }
    await uniformTiming(startTime);
    if (lockResult.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Your account has been temporarily locked for 15 minutes." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  // ── OTP 2FA ───────────────────────────────────────────────────────────────
  const isOtpRequired =
    process.env.OTP_ENABLED === "true" && (user.role === "owner" || user.otpEnabled);

  if (isOtpRequired) {
    const otpCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
    const codeHash = crypto.createHash("sha256").update(otpCode).digest("hex");
    const otpId = `otp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    try {
      await createEmailOtp({ id: otpId, userId: user.id, codeHash, expiresAt, attempts: 0, used: false, createdAt: new Date().toISOString() });
      await sendEmail({
        to: user.email,
        subject: "Your Recover AI verification code",
        text: `Your verification code is ${otpCode}. It expires in 10 minutes.`,
        html: `<p>Your Recover AI verification code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      });
    } catch (err) {
      return serverError(startTime, err);
    }

    await uniformTiming(startTime);

    // In demo mode without a real mail provider, surface the code in the response
    const mailConfigured = hasMailProvider();
    if (demo && !mailConfigured) {
      return NextResponse.json({ requiresOtp: true, userId: user.id, demoOtpCode: otpCode });
    }
    return NextResponse.json({ requiresOtp: true, userId: user.id });
  }

  // ── Success — create session ──────────────────────────────────────────────
  try {
    await recordSuccessfulLogin(user, ip, userAgent);
  } catch { /* audit failure is non-fatal */ }

  let rawToken: string;
  try {
    ({ rawToken } = await createSession(user.id, request));
  } catch (err) {
    return serverError(startTime, err);
  }

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
      role: user.role, // always from DB, never from client
      customerId: user.customerId,
    },
  });
}
