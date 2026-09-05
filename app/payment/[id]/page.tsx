import { readStore } from "@/lib/db/store";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import { FAILURE_CATEGORY_LABELS, STRATEGY_LABELS } from "@/lib/types";
import { STOP_REASON_LABELS } from "@/lib/stopping";
import Link from "next/link";
import { notFound } from "next/navigation";

const PLAIN_ACTIONS: Record<string, string> = {
  diagnosed: "Analysed the failure",
  probability_calculated: "Estimated recovery chances",
  strategy_selected: "Chose a recovery approach",
  timing_selected: "Scheduled the next action",
  action_executed: "Attempted recovery",
  result_observed: "Recorded the outcome",
  "nudge.sent": "Sent a reminder message",
  "batch.generated": "Loaded your payments",
};

function plainAction(action: string) {
  return PLAIN_ACTIONS[action] ?? action;
}

function plainOutcome(outcome: string) {
  if (outcome === "success") return "✓ Payment recovered";
  if (outcome === "failed") return "✗ Attempt failed";
  if (outcome === "skipped") return "→ Escalated to manual review";
  return outcome;
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const store = await readStore();
  const payment = store.payments.find((p) => p.id === id);
  if (!payment) notFound();

  const customer = store.customers.find((c) => c.id === payment.customerId);
  const failure = store.failureEvents.find((f) => f.paymentId === id);
  const logs = store.auditLogs
    .filter((l) => l.paymentId === id)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  if (!customer || !failure) return <div>Incomplete payment data</div>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagLog = logs.find(l => l.action === "diagnosed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const execLog = logs.find(l => l.action === "action_executed");

  const statusColor: Record<string, string> = {
    recovered: "text-green-700 bg-green-50 border-green-200",
    stopped: "text-red-700 bg-red-50 border-red-200",
    recovering: "text-amber-700 bg-amber-50 border-amber-200",
    failed: "text-muted bg-background border-border",
  };
  const statusLabel: Record<string, string> = {
    recovered: "Recovered ✓",
    stopped: "Stopped",
    recovering: "In progress",
    failed: "Failed",
  };

  const stopReasonPlain: Record<string, string> = {
    recovered: "Payment was recovered successfully.",
    permanent_failure:
      "This failure is permanent (e.g. expired card). Automated retry won't help — please update your payment details.",
    probability_below_threshold:
      "Recovery chances are too low to keep trying automatically.",
    alt_method_required:
      "A different payment method is needed before we can retry.",
    manual_review:
      "This account has had multiple failures. A specialist will review it.",
    max_attempts:
      "We reached the 3-attempt limit to protect your account from unnecessary charges.",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Payment case</p>
          <h1 className="font-display mt-1 text-3xl italic tracking-tight">{customer.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatInrFromPaise(payment.amountPaise)} · {FAILURE_CATEGORY_LABELS[failure.category]}
          </p>
        </div>
        <Link href="/overview" className="text-sm text-accent hover:underline">← Back to Dashboard</Link>
      </header>

      {/* Status + What Happened */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Progress steps */}
          <div className="rounded-xl border border-border bg-surface p-6 space-y-4">
            <h2 className="font-display text-xl italic">What happened &amp; what we did</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Step
                n={1}
                title="What failed"
                body={`${formatInrFromPaise(payment.amountPaise)} payment via ${payment.paymentMethod?.toUpperCase()} failed — ${failure.reason}`}
              />
              <Step
                n={2}
                title="What we found"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                body={diagLog
                  ? `Failure classified as ${(diagLog.detail as any)?.is_permanent ? "permanent" : "temporary"}. ${(diagLog.detail as any)?.reasoning ?? ""}`
                  : "Analysis pending."}
              />
              <Step
                n={3}
                title="What we tried"
                body={`Strategy: ${STRATEGY_LABELS[payment.assignedStrategy as keyof typeof STRATEGY_LABELS] ?? payment.assignedStrategy}. ${execLog
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  ? plainOutcome((execLog.detail as any)?.outcome ?? "")
                  : "Recovery attempted."}`}
              />
              <Step
                n={4}
                title="Current state"
                body={payment.stopReason
                  ? stopReasonPlain[payment.stopReason] ?? payment.stopReason
                  : payment.status === "recovered"
                  ? "Payment was recovered successfully. No further action needed."
                  : "Recovery is in progress."}
              />
            </div>
          </div>

          {/* Audit timeline */}
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="font-display text-xl italic mb-6">Full activity log</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-muted">No activity yet — run recovery first.</p>
            ) : (
              <ol className="relative border-l border-border ml-3 space-y-6 pb-2">
                {logs.map((log) => (
                  <li key={log.id} className="relative pl-6">
                    <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-accent border-[3px] border-surface" />
                    <p className="text-[11px] uppercase tracking-wider text-muted">{formatDateTime(log.at)}</p>
                    <p className="mt-0.5 font-medium text-sm">{plainAction(log.action)}</p>
                    <p className="mt-0.5 text-sm text-muted leading-relaxed">{log.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-display text-xl italic mb-4">Status</h3>
            <span
              className={`inline-flex px-3 py-1 rounded text-[11px] font-medium uppercase tracking-wider border ${statusColor[payment.status] ?? "text-muted border-border"}`}
            >
              {statusLabel[payment.status] ?? payment.status}
            </span>
            {payment.status === "recovered" && (
              <p className="mt-3 text-sm font-medium text-green-700">
                {formatInrFromPaise(payment.recoveredAmountPaise)} recovered
              </p>
            )}
            {payment.stopReason && payment.status !== "recovered" && (
              <p className="mt-3 text-sm text-muted leading-relaxed">
                {stopReasonPlain[payment.stopReason] ?? payment.stopReason}
              </p>
            )}
            {payment.retryCount > 0 && (
              <p className="mt-3 text-xs text-muted">
                {payment.retryCount} / 3 attempts used
                {payment.retryCount >= 3 ? " — limit reached" : ""}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-display text-xl italic mb-4">Customer</h3>
            <dl className="space-y-2 text-sm">
              <Row label="Name" value={customer.name} />
              <Row label="Payment method" value={payment.paymentMethod?.toUpperCase()} />
              <Row label="Bank" value={payment.bank || "N/A"} />
              <Row label="Attempts" value={`${payment.retryCount + 1} of 3`} />
              <Row label="Prior success rate" value={`${Math.round(customer.priorSuccessRate * 100)}%`} />
            </dl>
          </div>

          {STOP_REASON_LABELS[payment.stopReason as keyof typeof STOP_REASON_LABELS] && (
            <div className="rounded-xl border border-border bg-surface p-6">
              <h3 className="font-display text-xl italic mb-2">Stop reason</h3>
              <p className="text-sm text-muted leading-relaxed">
                {STOP_REASON_LABELS[payment.stopReason as keyof typeof STOP_REASON_LABELS]}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-6 h-6 rounded-full bg-accent-muted text-accent text-[11px] font-medium flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-accent font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
