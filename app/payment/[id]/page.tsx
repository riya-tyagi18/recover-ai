/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { readStore } from "@/lib/db/store";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import { FAILURE_CATEGORY_LABELS, STRATEGY_LABELS } from "@/lib/types";
import { Explainability } from "@/components/Explainability";
import { AgentDecisionFlow } from "@/components/AgentDecisionFlow";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PaymentDetailPage({ params }: { params: { id: string } }) {
  const store = await readStore();
  const payment = store.payments.find((p) => p.id === params.id);

  if (!payment) {
    notFound();
  }

  const customer = store.customers.find((c) => c.id === payment.customerId);
  const failure = store.failureEvents.find((f) => f.paymentId === payment.id);
  const logs = store.auditLogs.filter((l) => l.paymentId === payment.id);

  if (!customer || !failure) {
    return <div>Incomplete payment data</div>;
  }

  // Determine explanation fields from logs
  const diagLog = logs.find(l => l.action === "diagnosed");
  const stratLog = logs.find(l => l.action === "strategy.selected");
  const stopLog = logs.find(l => l.action === "stopped");
  
  const happened = `Payment of ${formatInrFromPaise(payment.amountPaise)} failed with reason: ${FAILURE_CATEGORY_LABELS[failure.category]}.`;
  const understood = diagLog ? `The agent diagnosed this as a ${(diagLog.detail as any)?.is_permanent ? 'permanent' : 'temporary'} failure with ${(diagLog.detail as any)?.confidence * 100}% confidence. Reasoning: ${(diagLog.detail as any)?.reasoning}` : "Agent hasn't processed this yet.";
  const reasoning = stratLog ? `Selected strategy '${STRATEGY_LABELS[(stratLog.detail as any)?.strategy as keyof typeof STRATEGY_LABELS]}' due to a ${(stratLog.detail as any)?.probability}% recovery probability.` : "No strategy selected yet.";
  const outcome = stopLog ? `Agent stopped. Reason: ${(stopLog.detail as any)?.reason}` : "Agent is currently retrying or hasn't started.";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Payment Details</p>
          <h1 className="font-display mt-1 text-3xl italic tracking-tight">{payment.id}</h1>
        </div>
        <Link href="/simulate" className="text-sm text-accent hover:underline">
          &larr; Back to Simulation Center
        </Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <Explainability 
            happened={happened}
            understood={understood}
            reasoning={reasoning}
            outcome={outcome}
          />
          <AgentDecisionFlow logs={logs} />
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-display text-xl italic mb-4">Customer Info</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Name</dt><dd>{customer.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Segment</dt><dd>{customer.segment}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Prior Success</dt><dd>{customer.priorSuccessCount} ({Math.round(customer.priorSuccessRate * 100)}%)</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Payment Method</dt><dd>{payment.paymentMethod}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Bank</dt><dd>{payment.bank || "N/A"}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h3 className="font-display text-xl italic mb-4">Current Status</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Status</dt><dd className="uppercase tracking-wider text-[11px] font-medium">{payment.status}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Attempts</dt><dd>{payment.retryCount}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Strategy</dt><dd>{STRATEGY_LABELS[payment.assignedStrategy as keyof typeof STRATEGY_LABELS]}</dd></div>
              {payment.stopReason && (
                <div className="flex justify-between"><dt className="text-muted">Stop Reason</dt><dd>{payment.stopReason}</dd></div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
