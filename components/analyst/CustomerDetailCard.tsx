"use client";

import { formatInrFromPaise } from "@/lib/format";
import type { CustomerSegmentationResult } from "@/lib/analyst/segmentation";
import { SEGMENT_METADATA } from "@/lib/analyst/segmentation";
import type { Payment } from "@/lib/types";
import Link from "next/link";

interface CustomerDetailCardProps {
  data: CustomerSegmentationResult;
  payments?: Payment[];
  onClose?: () => void;
}

export function CustomerDetailCard({ data, payments = [], onClose }: CustomerDetailCardProps) {
  const { customer, primarySegment, allTags, rulesTriggered, recommendedAction } = data;
  const meta = SEGMENT_METADATA[primarySegment];

  return (
    <div className="card p-6 space-y-6 border-accent/40 bg-surface">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-2xl italic text-foreground">
              {customer.customerName}
            </h3>
            <span className="font-mono text-xs text-muted bg-surface-subtle px-2 py-0.5 rounded border border-border">
              {customer.customerId}
            </span>
            <span className={meta.badgeClass}>{primarySegment}</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Account diagnostic profile, behavioral tags, and recovery recommendations.
          </p>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-xs p-1"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>

      {/* Thin History Warning */}
      {customer.isLowConfidence && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 flex items-start gap-2.5 text-xs text-amber-900">
          <svg className="w-4 h-4 text-[#b45309] shrink-0 mt-0.5" viewBox="0 0 16 16" fill="none">
            <path d="M8 2l6 11H2L8 2zM8 6v3m0 2h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <div>
            <p className="font-semibold">Low Confidence Assessment</p>
            <p className="mt-0.5 text-amber-800">
              {customer.confidenceReason ||
                "Thin transaction history (fewer than 3 recorded payments). Risk classification is preliminary."}
            </p>
          </div>
        </div>
      )}

      {/* Core Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
            Total Value
          </span>
          <p className="font-semibold text-foreground text-base mt-1">
            {formatInrFromPaise(customer.totalTransactionValuePaise)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
            Value at Risk
          </span>
          <p className="font-semibold text-accent text-base mt-1">
            {formatInrFromPaise(customer.valueAtRiskPaise)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
            Failure Rate
          </span>
          <p className="font-semibold text-foreground text-base mt-1">
            {(customer.failureRate * 100).toFixed(1)}%
          </p>
          <span className="text-[10px] text-muted">
            {customer.totalFailures} / {customer.totalAttempts} attempts
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface-subtle p-3">
          <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
            Retries &amp; Outcomes
          </span>
          <p className="font-semibold text-foreground text-base mt-1">
            {customer.retriesExecuted} executed
          </p>
          <span className="text-[10px] text-muted">
            {customer.recoveredByRetryCount} recovered by retry
          </span>
        </div>
      </div>

      {/* Segment Classification & Rules That Fired */}
      <div className="rounded-xl border border-border bg-surface-subtle p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm text-foreground">
            Segment Rules Triggered
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <span key={tag} className={SEGMENT_METADATA[tag].badgeClass}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {allTags.map((tag) => {
            const rules = rulesTriggered[tag] || [];
            if (rules.length === 0) return null;
            return (
              <div key={tag} className="border-l-2 pl-3 py-0.5" style={{ borderColor: SEGMENT_METADATA[tag].color }}>
                <p className="font-semibold text-foreground">{tag}</p>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-muted">
                  {rules.map((rule, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommended Next Action */}
      <div className="rounded-xl border border-accent/30 bg-accent-muted/20 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent" />
            <h4 className="font-semibold text-sm text-foreground">
              Recommended Recovery Action
            </h4>
          </div>
          <span className="badge-recovered text-[10px]">{recommendedAction.strategy}</span>
        </div>
        <p className="font-medium text-xs text-foreground">{recommendedAction.title}</p>
        <p className="text-xs text-muted leading-relaxed">{recommendedAction.reasoning}</p>
      </div>

      {/* Top Failure Reasons & Recent Payments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div>
          <h5 className="font-semibold text-xs text-foreground mb-2">Top Failure Reasons</h5>
          {customer.topFailureReasons.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {customer.topFailureReasons.map((reason) => (
                <span
                  key={reason}
                  className="px-2 py-1 rounded bg-surface border border-border text-[11px] text-muted"
                >
                  {reason}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">No specific failure codes recorded.</p>
          )}
        </div>

        <div>
          <h5 className="font-semibold text-xs text-foreground mb-2">Related Payments</h5>
          <div className="space-y-1">
            {payments.slice(0, 3).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-xs">
                <Link
                  href={`/payment/${p.id}`}
                  className="font-mono text-accent hover:underline"
                >
                  {p.id}
                </Link>
                <span className="text-muted">{formatInrFromPaise(p.amountPaise)}</span>
                <span
                  className={
                    p.status === "recovered"
                      ? "badge-recovered text-[10px]"
                      : p.status === "stopped"
                      ? "badge-stopped text-[10px]"
                      : "badge-at-risk text-[10px]"
                  }
                >
                  {p.status}
                </span>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="text-xs text-muted">No payments found in active batch.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
