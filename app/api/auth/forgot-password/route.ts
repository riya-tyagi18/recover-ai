import { NextResponse } from "next/server";
import crypto from "crypto";
import { isValidEmail } from "@/lib/auth/password";
import { findUserByEmail, createPasswordReset, logAuthEvent } from "@/lib/db/auth-store";
import { checkIpRateLimit, uniformTiming } from "@/lib/auth/rate-limit";
import { getClientIp, getUserAgent } from "@/lib/auth/session";
import { validateCsrf } from "@/lib/auth/guard";
import { isDemoMode } from "@/lib/auth/seed";
import { hasMailProvider, sendEmail } from "@/lib/auth/mail";

export async function POST(request: Request) {
  const startTime = Date.now();
  const ip = getClientIp(request);
  const userAgent = getUserAgent(request);

  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  // Rate limit: max 10 reset requests per minute per IP
  const ipLimit = await checkIpRateLimit(ip, "forgot-password", 10, 60 * 1000);
  if (!ipLimit.allowed) {
    return NextResponse.json({ error: ipLimit.error }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email } = body;

    const genericSuccess = {
      message: "If an account exists with this email address, a password reset link has been sent.",
    };

    if (!isValidEmail(email)) {
      // Return generic message even for invalid format to avoid enumeration
      await uniformTiming(startTime);
      return NextResponse.json(genericSuccess);
    }

    const normEmail = email.trim().toLowerCase();
    const user = await findUserByEmail(normEmail);

    let rawTokenForDemo: string | null = null;

    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

      await createPasswordReset({
        id: hashedToken,
        userId: user.id,
        expiresAt,
        used: false,
        createdAt: new Date().toISOString(),
      });

      await logAuthEvent({
        userId: user.id,
        event: "password.reset_request",
        ip,
        userAgent,
        detail: { email: normEmail },
      });

      const origin = request.headers.get("origin") || "http://localhost:3000";
      const resetLink = `${origin}/reset-password?token=${rawToken}`;

      await sendEmail({
        to: user.email,
        subject: "Recover AI — Password Reset Request",
        text: `You requested a password reset for your Recover AI account. Visit this link to set a new password: ${resetLink}. This link expires in 30 minutes.`,
        html: `<p>You requested a password reset for your Recover AI account.</p><p><a href="${resetLink}">Click here to reset your password</a></p><p>This link expires in 30 minutes. If you did not make this request, you can safely ignore this email.</p>`,
      });

      if (isDemoMode() && !hasMailProvider()) {
        rawTokenForDemo = rawToken;
      }
    } else {
      await logAuthEvent({
        userId: null,
        event: "password.reset_request",
        ip,
        userAgent,
        detail: { email: normEmail, found: false },
      });
    }

    await uniformTiming(startTime);

    if (rawTokenForDemo) {
      return NextResponse.json({
        ...genericSuccess,
        demoResetToken: rawTokenForDemo,
      });
    }

    return NextResponse.json(genericSuccess);
  } catch (err) {
    console.error("Forgot password error:", err);
    await uniformTiming(startTime);
    return NextResponse.json({
      message: "If an account exists with this email address, a password reset link has been sent.",
    });
  }
}
