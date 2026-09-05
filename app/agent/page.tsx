import { readStore } from "@/lib/db/store";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import { FAILURE_CATEGORY_LABELS } from "@/lib/types";
import Link from "next/link";

const PLAIN_ACTIONS: Record<string, string> = {
  diagnosed: "Analysed the failure",
  probability_calculated: "Estimated recovery chances",
  strategy_selected: "Chose a recovery approach",
  timing_selected: "Scheduled the next action",
  action_executed: "Attempted recovery",
  result_observed: "Recorded the outcome",
  "nudge.sent": "Sent a reminder message",
  "batch.generated": "Loaded payment data",
};

function plainAction(action: string) {
  return PLAIN_ACTIONS[action] ?? action;
}

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const store = await readStore();

  // Show payment-level audit logs (exclude batch-level)
  const logs = store.auditLogs
    .filter((l) => l.paymentId !== null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 200);

  const paymentMap = new Map(store.payments.map((p) => [p.id, p]));
  const customerMap = new Map(store.customers.map((c) => [c.id, c]));
  const failureMap = new Map(store.failureEvents.map((f) => [f.paymentId, f]));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header>
        <h1 className="font-display text-3xl italic tracking-tight">Agent Audit</h1>
        <p className="mt-2 text-sm text-muted">
          Every decision the recovery agent made, in plain language.
        </p>
      </header>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-5 py-16 text-center">
          <p className="font-display text-xl italic">No activity yet</p>
          <p className="mt-2 text-sm text-muted">
            Connect your payment account to start recovery.
          </p>
          <Link
            href="/connect"
            className="mt-4 inline-block rounded-md bg-accent px-5 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
          >
            Connect payments
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-[11px] uppercase tracking-[0.12em] text-muted">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Failure</th>
                <th className="px-4 py-3 font-medium">Action taken</th>
                <th className="px-4 py-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const payment = paymentMap.get(log.paymentId ?? "");
                const customer = payment ? customerMap.get(payment.customerId) : null;
                const failure = payment ? failureMap.get(payment.id) : null;
                return (
                  <tr key={log.id} className="border-b border-border/70 last:border-0 hover:bg-muted/5">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {formatDateTime(log.at)}
                    </td>
                    <td className="px-4 py-3">
                      {log.paymentId ? (
                        <Link
                          href={`/payment/${log.paymentId}`}
                          className="text-accent hover:underline font-medium"
                        >
                          {customer?.name ?? log.paymentId}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {payment ? formatInrFromPaise(payment.amountPaise) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {failure ? FAILURE_CATEGORY_LABELS[failure.category] : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-sm">
                      {plainAction(log.action)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">
                      {log.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
