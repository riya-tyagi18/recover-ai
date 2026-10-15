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

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limit: max 20 login attempts per minute per IP
  const ipLimit = await checkIpRateLimit(ip, "login", 20, 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }

    let searchEmail = email.trim().toLowerCase();
    const demo = isDemoMode();

    // Map demo aliases if demo mode is enabled
    if (demo) {
      if (searchEmail === DEMO_OWNER_ALIAS) {
        searchEmail = DEMO_OWNER_EMAIL;
      } else if (searchEmail === DEMO_CUSTOMER_ALIAS) {
        searchEmail = DEMO_CUSTOMER_EMAIL;
      }
    } else {
      // In production mode, reject demo shorthand aliases
      if (searchEmail === DEMO_OWNER_ALIAS || searchEmail === DEMO_CUSTOMER_ALIAS) {
        await dummyVerify(password);
        await uniformTiming(startTime);
        return NextResponse.json(
          { error: "Invalid email or password." },
          { status: 401 },
        );
      }
    }

    let user = await findUserByEmail(searchEmail);

    // If demo mode is active and user is missing, seed demo accounts
    if (!user && demo && (searchEmail === DEMO_OWNER_EMAIL || searchEmail === DEMO_CUSTOMER_EMAIL)) {
      await seedAuthAccounts();
      user = await findUserByEmail(searchEmail);
    }

    // If user does not exist in the database
    if (!user) {
      await dummyVerify(password);
      await recordFailedLogin(null, ip, userAgent);
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Check if account is locked
    const locked = await isAccountLocked(user);
    if (locked) {
      await dummyVerify(password);
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "This account has been temporarily locked due to too many failed attempts. Please try again in 15 minutes." },
        { status: 429 },
      );
    }

    // Verify password with bcrypt
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      const lockResult = await recordFailedLogin(user, ip, userAgent);
      await uniformTiming(startTime);
      if (lockResult.locked) {
        return NextResponse.json(
          { error: "Too many failed attempts. Your account has been temporarily locked for 15 minutes." },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Check OTP requirement:
    // Required for owner accounts when OTP_ENABLED is "true", or when user has enabled OTP
    const isOtpRequired =
      process.env.OTP_ENABLED === "true" && (user.role === "owner" || user.otpEnabled);

    if (isOtpRequired) {
      // Generate 6-digit code
      const otpCode = Math.floor(100000 + crypto.randomInt(900000)).toString();
      const codeHash = crypto.createHash("sha256").update(otpCode).digest("hex");
      const otpId = `otp_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

      await createEmailOtp({
        id: otpId,
        userId: user.id,
        codeHash,
        expiresAt,
        attempts: 0,
        used: false,
        createdAt: new Date().toISOString(),
      });

      // Send code via email
      await sendEmail({
        to: user.email,
        subject: "Your Recover AI verification code",
        text: `Your verification code is ${otpCode}. It expires in 10 minutes.`,
        html: `<p>Your Recover AI verification code is: <strong>${otpCode}</strong></p><p>This code expires in 10 minutes.</p>`,
      });

      await uniformTiming(startTime);

      // In demo mode without configured mail provider, provide demoOtpCode for smooth verification
      const mailConfigured = hasMailProvider();
      if (demo && !mailConfigured) {
        return NextResponse.json({
          requiresOtp: true,
          userId: user.id,
          demoOtpCode: otpCode,
        });
      }

      // In production mode, code is NEVER returned to client
      return NextResponse.json({
        requiresOtp: true,
        userId: user.id,
      });
    }

    // Success without OTP
    await recordSuccessfulLogin(user, ip, userAgent);
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
        role: user.role, // Returned from database, never from client
        customerId: user.customerId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    await uniformTiming(startTime);
    return NextResponse.json(
      { error: "An unexpected error occurred during login." },
      { status: 500 },
    );
  }
}
