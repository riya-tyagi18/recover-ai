import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { isValidEmail, validatePassword, hashPassword } from "@/lib/auth/password";
import { findUserByEmail, createUser, logAuthEvent } from "@/lib/db/auth-store";
import { createSession, getClientIp, getUserAgent, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { checkIpRateLimit, uniformTiming } from "@/lib/auth/rate-limit";
import { validateCsrf } from "@/lib/auth/guard";
import { mutateStore } from "@/lib/db/store";
import type { Customer, User } from "@/lib/types";

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limiting per IP: max 10 registrations per minute
  const ipLimit = await checkIpRateLimit(ip, "register", 10, 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { name, email, password } = body;

    // Server-side validation
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Please enter your full name (at least 2 characters)." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      await uniformTiming(startTime);
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    const normEmail = email.trim().toLowerCase();

    // Check duplicate email
    const existing = await findUserByEmail(normEmail);
    if (existing) {
      // Generic error rejecting duplicates without revealing sensitive details
      await uniformTiming(startTime);
      return NextResponse.json(
        { error: "An account with this email cannot be registered. If you already have an account, please sign in." },
        { status: 400 },
      );
    }

    // Role is ALWAYS enforced to "user" for public registrations.
    // Client-sent role is completely ignored.
    const userId = `usr_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const customerId = `cust_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const passwordHash = await hashPassword(password);
    const nowIso = new Date().toISOString();

    const newUser: User = {
      id: userId,
      name: name.trim(),
      email: normEmail,
      passwordHash,
      role: "user", // Enforced role
      createdAt: nowIso,
      emailVerified: false,
      failedAttempts: 0,
      lockedUntil: null,
      customerId,
      otpSecret: null,
      otpEnabled: false,
    };

    await createUser(newUser);

    // Create a customer profile for this user
    await mutateStore((store) => {
      const newCustomer: Customer = {
        id: customerId,
        name: name.trim(),
        segment: "new",
        priorSuccessCount: 0,
        priorSuccessRate: 0,
        paymentMethod: "upi",
        bank: "HDFC Bank",
        createdAt: nowIso,
        userId,
      };
      store.customers.push(newCustomer);
    });

    // Create session
    const { rawToken } = await createSession(userId, request);

    // Set secure cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    await logAuthEvent({
      userId,
      event: "register.success",
      ip,
      userAgent,
      detail: { email: normEmail, role: "user" },
    });

    await uniformTiming(startTime);

    return NextResponse.json({
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        customerId: newUser.customerId,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    await uniformTiming(startTime);
    return NextResponse.json(
      { error: "Failed to complete registration. Please try again." },
      { status: 500 },
    );
  }
}
