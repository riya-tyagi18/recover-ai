import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireOwner } from "@/lib/auth/guard";
import { isValidEmail, validatePassword, hashPassword } from "@/lib/auth/password";
import { findUserByEmail, createUser, logAuthEvent } from "@/lib/db/auth-store";
import { getClientIp, getUserAgent } from "@/lib/auth/session";
import type { User } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const caller = await requireOwner(request);
    const ip = getClientIp(request);
    const userAgent = getUserAgent(request);

    const body = await request.json().catch(() => ({}));
    const { name, email, password } = body;

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Owner name must be at least 2 characters." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.error }, { status: 400 });
    }

    const normEmail = email.trim().toLowerCase();
    const existing = await findUserByEmail(normEmail);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 400 },
      );
    }

    const passwordHash = await hashPassword(password);
    const newOwner: User = {
      id: `usr_owner_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`,
      name: name.trim(),
      email: normEmail,
      passwordHash,
      role: "owner", // Explicitly created by existing owner
      createdAt: new Date().toISOString(),
      emailVerified: true,
      failedAttempts: 0,
      lockedUntil: null,
      customerId: null,
      otpSecret: null,
      otpEnabled: false,
    };

    await createUser(newOwner);

    await logAuthEvent({
      userId: caller.id,
      event: "owner.created",
      ip,
      userAgent,
      detail: { createdOwnerEmail: normEmail, createdBy: caller.email },
    });

    return NextResponse.json({
      ok: true,
      owner: {
        id: newOwner.id,
        name: newOwner.name,
        email: newOwner.email,
        role: newOwner.role,
      },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Failed to create owner account.";
    return NextResponse.json({ error: message }, { status });
  }
}
