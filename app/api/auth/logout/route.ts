import { NextResponse } from "next/server";
import { destroySession, getClientIp, getUserAgent, validateSession } from "@/lib/auth/session";
import { logAuthEvent } from "@/lib/db/auth-store";
import { validateCsrf } from "@/lib/auth/guard";

export async function POST(request: Request) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const current = await validateSession(request);
  if (current) {
    await logAuthEvent({
      userId: current.user.id,
      event: "logout",
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      detail: { role: current.user.role },
    });
  }

  await destroySession(request);

  return NextResponse.json({ ok: true });
}
