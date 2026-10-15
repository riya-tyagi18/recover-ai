import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth/guard";
import { getAuthAuditLogs } from "@/lib/db/auth-store";

export async function GET(request: Request) {
  try {
    await requireOwner(request);

    const logs = await getAuthAuditLogs(200);

    // Analyze suspicious patterns
    const ipFailures: Record<string, number> = {};
    let lockoutCount = 0;
    let accessDeniedCount = 0;

    for (const log of logs) {
      if (log.ip) {
        if (log.event === "login.failure") {
          ipFailures[log.ip] = (ipFailures[log.ip] || 0) + 1;
        }
      }
      if (log.event === "lockout") {
        lockoutCount += 1;
      }
      if (log.event === "access_denied") {
        accessDeniedCount += 1;
      }
    }

    const suspiciousIps = Object.entries(ipFailures)
      .filter(([_, count]) => count >= 5)
      .map(([ip, count]) => ({ ip, count }));

    const suspiciousPatterns = {
      hasSuspiciousActivity: suspiciousIps.length > 0 || lockoutCount >= 3 || accessDeniedCount >= 5,
      suspiciousIps,
      lockoutCount,
      accessDeniedCount,
    };

    return NextResponse.json({
      logs,
      suspiciousPatterns,
      stats: {
        totalEvents: logs.length,
        lockouts: lockoutCount,
        accessDenied: accessDeniedCount,
        suspiciousIpsCount: suspiciousIps.length,
      },
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }
}
