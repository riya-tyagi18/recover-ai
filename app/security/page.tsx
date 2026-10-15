import { redirect } from "next/navigation";
import { validateSession } from "@/lib/auth/session";
import { getAuthAuditLogs } from "@/lib/db/auth-store";
import { SecurityAuditClient } from "./SecurityAuditClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Security & Audit Log — Recover AI",
  description: "Monitor authentication events, access control, lockouts, and suspicious activity patterns.",
};

export default async function SecurityAuditPage() {
  const sessionResult = await validateSession();
  if (!sessionResult) {
    redirect("/login");
  }

  if (sessionResult.user.role !== "owner") {
    redirect("/customer/dashboard");
  }

  const logs = await getAuthAuditLogs(200);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl italic tracking-tight text-foreground">
              Security &amp; Audit Log
            </h1>
            <span className="badge-recovered text-xs font-medium">Owner Only</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Tamper-evident log of authentication events, role checks, account lockouts, and suspicious pattern flags.
          </p>
        </div>
      </header>

      <SecurityAuditClient initialLogs={logs} />
    </div>
  );
}
