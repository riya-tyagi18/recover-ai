"use client";

import { useState, useMemo } from "react";
import { formatDateTime } from "@/lib/format";
import type { AuthAuditLog } from "@/lib/types";

type FilterType = "all" | "login" | "lockout" | "access_denied" | "password" | "owner";

const EVENT_LABELS: Record<string, { label: string; badgeClass: string }> = {
  "login.success": { label: "Login Success", badgeClass: "badge-recovered" },
  "login.failure": { label: "Login Failed", badgeClass: "badge-pending" },
  "lockout": { label: "Account Locked", badgeClass: "badge-stopped" },
  "logout": { label: "Logged Out", badgeClass: "badge-pending" },
  "register.success": { label: "User Registered", badgeClass: "badge-recovered" },
  "password.reset_request": { label: "Reset Requested", badgeClass: "badge-at-risk" },
  "password.reset_success": { label: "Password Changed", badgeClass: "badge-recovered" },
  "access_denied": { label: "Access Denied (403)", badgeClass: "badge-stopped" },
  "owner.created": { label: "Owner Created", badgeClass: "badge-recovered" },
  "otp.sent": { label: "OTP Dispatched", badgeClass: "badge-at-risk" },
  "otp.verified": { label: "OTP Verified", badgeClass: "badge-recovered" },
  "otp.failed": { label: "OTP Failed", badgeClass: "badge-pending" },
  "otp.exceeded": { label: "OTP Attempts Exceeded", badgeClass: "badge-stopped" },
};

export function SecurityAuditClient({ initialLogs }: { initialLogs: AuthAuditLog[] }) {
  const [logs] = useState<AuthAuditLog[]>(initialLogs);
  const [filter, setFilter] = useState<FilterType>("all");
  const [query, setQuery] = useState("");

  // Owner invite form state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Compute stats and suspicious patterns
  const analysis = useMemo(() => {
    const ipCounts: Record<string, number> = {};
    let lockouts = 0;
    let accessDenied = 0;
    let failures = 0;

    for (const log of logs) {
      if (log.ip && log.event === "login.failure") {
        ipCounts[log.ip] = (ipCounts[log.ip] || 0) + 1;
        failures += 1;
      }
      if (log.event === "lockout") lockouts += 1;
      if (log.event === "access_denied") accessDenied += 1;
    }

    const suspiciousIps = Object.entries(ipCounts)
      .filter(([_, count]) => count >= 5)
      .map(([ip, count]) => ({ ip, count }));

    return {
      failures,
      lockouts,
      accessDenied,
      suspiciousIps,
      isSuspicious: suspiciousIps.length > 0 || lockouts >= 2 || accessDenied >= 3,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filter === "login" && !log.event.startsWith("login.")) return false;
      if (filter === "lockout" && log.event !== "lockout") return false;
      if (filter === "access_denied" && log.event !== "access_denied") return false;
      if (filter === "password" && !log.event.startsWith("password.")) return false;
      if (filter === "owner" && log.event !== "owner.created") return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const matchEvent = log.event.toLowerCase().includes(q);
        const matchUser = log.userId?.toLowerCase().includes(q) ?? false;
        const matchIp = log.ip?.toLowerCase().includes(q) ?? false;
        const matchAgent = log.userAgent?.toLowerCase().includes(q) ?? false;
        const matchDetail = JSON.stringify(log.detail ?? {}).toLowerCase().includes(q);
        if (!matchEvent && !matchUser && !matchIp && !matchAgent && !matchDetail) return false;
      }
      return true;
    });
  }, [logs, filter, query]);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteMsg(null);

    try {
      const res = await fetch("/api/owner/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName,
          email: inviteEmail,
          password: invitePassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to invite owner.");
      }

      setInviteMsg({ text: `Owner account created for ${data.owner.email}!`, error: false });
      setInviteName("");
      setInviteEmail("");
      setInvitePassword("");
    } catch (err: unknown) {
      setInviteMsg({ text: (err as Error).message || "Error creating owner.", error: true });
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Suspicious Patterns Alert Banner */}
      {analysis.isSuspicious && (
        <div className="rounded-2xl border border-red-500/40 bg-red-50/40 dark:bg-red-950/20 p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-600 animate-pulse" />
            <h3 className="font-semibold text-sm text-red-900 dark:text-red-300">
              Suspicious Security Pattern Detected
            </h3>
          </div>
          <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
            Automated threat monitoring identified repeated anomalies:
            {analysis.suspiciousIps.length > 0 && (
              <span className="block mt-1">
                • High failure volume ({analysis.suspiciousIps.map((s) => `${s.ip}: ${s.count} failures`).join(", ")})
              </span>
            )}
            {analysis.lockouts > 0 && (
              <span className="block mt-0.5">
                • {analysis.lockouts} temporary account lockout(s) triggered
              </span>
            )}
            {analysis.accessDenied > 0 && (
              <span className="block mt-0.5">
                • {analysis.accessDenied} unauthorized role access denial(s) intercepted
              </span>
            )}
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">Total Events</p>
          <p className="mt-1 font-display text-2xl italic tracking-tight text-foreground">{logs.length}</p>
          <p className="mt-1 text-[10px] text-muted">Audited security actions</p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">Failed Logins</p>
          <p className="mt-1 font-display text-2xl italic tracking-tight text-amber-800">{analysis.failures}</p>
          <p className="mt-1 text-[10px] text-muted">Wrong credentials logged</p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">Account Lockouts</p>
          <p className={`mt-1 font-display text-2xl italic tracking-tight ${analysis.lockouts > 0 ? "text-red-600" : "text-foreground"}`}>
            {analysis.lockouts}
          </p>
          <p className="mt-1 text-[10px] text-muted">5-attempt limit reached</p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">Access Denied (403)</p>
          <p className={`mt-1 font-display text-2xl italic tracking-tight ${analysis.accessDenied > 0 ? "text-red-600" : "text-foreground"}`}>
            {analysis.accessDenied}
          </p>
          <p className="mt-1 text-[10px] text-muted">RBAC violations blocked</p>
        </div>
      </section>

      {/* Action Bar + Invite Owner CTA */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "all" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            All ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("lockout")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "lockout" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Lockouts ({analysis.lockouts})
          </button>
          <button
            type="button"
            onClick={() => setFilter("access_denied")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "access_denied" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Access Denied ({analysis.accessDenied})
          </button>
          <button
            type="button"
            onClick={() => setFilter("password")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === "password" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Password Resets
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="audit-search"
            type="search"
            placeholder="Search IP, user ID, details..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-56 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
          />

          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="shrink-0 rounded-xl bg-accent px-3.5 py-2 text-xs font-medium text-white hover:bg-accent-hover transition-colors shadow-sm"
          >
            + Invite Owner
          </button>
        </div>
      </div>

      {/* Owner Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-display text-xl italic text-foreground">Invite Business Owner</h3>
              <button
                type="button"
                onClick={() => { setShowInviteModal(false); setInviteMsg(null); }}
                className="text-muted hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Owner accounts have full administrative access to all recovery analytics, strategy settings, and audit logs.
            </p>

            <form onSubmit={handleInviteSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Owner Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Finance Lead"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="owner@company.com"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted uppercase tracking-wider">Initial Password</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Min 8 characters, letters & numbers"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  required
                />
              </div>

              {inviteMsg && (
                <div className={`p-3 rounded-xl text-xs ${inviteMsg.error ? "bg-red-50/40 text-red-600 border border-red-500/30" : "bg-green-50/40 text-green-700 border border-green-500/30"}`}>
                  {inviteMsg.text}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs text-muted hover:text-foreground"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-xl bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  {inviteLoading ? "Creating..." : "Create Owner Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Events Table */}
      <div className="card overflow-hidden">
        <div className="table-container">
          <table className="w-full text-left text-sm min-w-[760px]">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Account / User ID</th>
                <th className="px-4 py-3 font-medium">IP Address</th>
                <th className="px-4 py-3 font-medium">User Agent</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const info = EVENT_LABELS[log.event] || {
                  label: log.event,
                  badgeClass: "badge-pending",
                };
                const isSuspiciousIp = analysis.suspiciousIps.some((s) => s.ip === log.ip);

                return (
                  <tr key={log.id} className="border-b border-border/70 last:border-0 hover:bg-muted/5">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={info.badgeClass}>{info.label}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground truncate max-w-[140px]">
                      {log.userId || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{log.ip || "127.0.0.1"}</span>
                        {isSuspiciousIp && (
                          <span className="rounded px-1.5 py-0.2 bg-red-100 text-red-700 text-[9px] uppercase font-bold tracking-wider">
                            Suspicious
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted truncate max-w-[180px]">
                      {log.userAgent || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted truncate max-w-[200px]">
                      {log.detail ? JSON.stringify(log.detail) : "—"}
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No security audit events found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
