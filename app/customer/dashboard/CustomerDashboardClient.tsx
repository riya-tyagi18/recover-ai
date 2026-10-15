"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import type { Payment } from "@/lib/types";

type EnrichedPayment = Payment & {
  failureReason: string;
  failureCategory: string;
};

type FilterType = "all" | "recovered" | "action_needed" | "in_progress";

function getPlainStatus(p: EnrichedPayment): {
  title: string;
  badgeClass: string;
  explanation: string;
  badgeLabel: string;
} {
  if (p.status === "recovered") {
    return {
      title: "Payment Recovered",
      badgeClass: "badge-recovered",
      badgeLabel: "Successful",
      explanation: "Payment recovered successfully. Your subscription remains active and up-to-date.",
    };
  }

  if (p.status === "recovering") {
    if (p.assignedStrategy === "nudge_then_retry") {
      return {
        title: "Reminder Sent",
        badgeClass: "badge-at-risk",
        badgeLabel: "In Progress",
        explanation: "A notification was sent to your phone/email. We will retry once you have had time to review.",
      };
    }
    if (p.assignedStrategy === "alt_payment_request") {
      return {
        title: "Alternate Payment Requested",
        badgeClass: "badge-at-risk",
        badgeLabel: "Action Needed",
        explanation: "We sent an alternate payment link. Please select a backup UPI or card method.",
      };
    }
    return {
      title: "Retry Scheduled",
      badgeClass: "badge-at-risk",
      badgeLabel: "In Progress",
      explanation: `Automatic retry attempt ${p.retryCount + 1} of 3 is scheduled during the optimal bank processing window.`,
    };
  }

  if (p.status === "stopped") {
    if (p.stopReason === "permanent_failure" || p.failureCategory === "card_expired") {
      return {
        title: "Action Required: Update Card",
        badgeClass: "badge-stopped",
        badgeLabel: "Needs Action",
        explanation: "Your card is expired or has been declined permanently. Please update your payment details.",
      };
    }
    if (p.stopReason === "manual_review") {
      return {
        title: "Under Support Review",
        badgeClass: "badge-stopped",
        badgeLabel: "Under Review",
        explanation: "Our billing specialist team is manually verifying this transaction with the issuing bank.",
      };
    }
    return {
      title: "Action Required",
      badgeClass: "badge-stopped",
      badgeLabel: "Needs Action",
      explanation: "Automatic retries stopped after 3 attempts to prevent bank fees. Please update your payment method.",
    };
  }

  return {
    title: "Payment Failed",
    badgeClass: "badge-pending",
    badgeLabel: "Pending Recovery",
    explanation: "Initial bank debit failed. Our automated system is diagnosing the reason and scheduling recovery.",
  };
}

export function CustomerDashboardClient({ payments }: { payments: EnrichedPayment[] }) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const total = payments.length;
    const recovered = payments.filter((p) => p.status === "recovered");
    const recoveredPaise = recovered.reduce((sum, p) => sum + (p.recoveredAmountPaise || p.amountPaise), 0);
    const inProgress = payments.filter((p) => p.status === "recovering");
    const actionNeeded = payments.filter((p) => p.status === "stopped" || p.status === "failed");

    return {
      total,
      recoveredCount: recovered.length,
      recoveredPaise,
      inProgressCount: inProgress.length,
      actionNeededCount: actionNeeded.length,
    };
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (filter === "recovered" && p.status !== "recovered") return false;
      if (filter === "in_progress" && p.status !== "recovering") return false;
      if (filter === "action_needed" && p.status !== "stopped" && p.status !== "failed") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesId = p.id.toLowerCase().includes(q);
        const matchesBank = p.bank.toLowerCase().includes(q);
        const matchesMethod = p.paymentMethod.toLowerCase().includes(q);
        const matchesReason = p.failureReason.toLowerCase().includes(q);
        if (!matchesId && !matchesBank && !matchesMethod && !matchesReason) return false;
      }
      return true;
    });
  }, [payments, filter, search]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">
            Total Payments
          </p>
          <p className="mt-1 font-display text-2xl italic tracking-tight text-foreground">
            {stats.total}
          </p>
          <p className="mt-1 text-[10px] text-muted">All subscription charges</p>
        </div>

        <div className="card p-4 border-accent/40 bg-accent-muted/40 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.14em] text-accent font-medium">
            Recovered Revenue
          </p>
          <p className="mt-1 font-display text-2xl italic tracking-tight text-accent font-semibold">
            {formatInrFromPaise(stats.recoveredPaise)}
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {stats.recoveredCount} successful recoveries
          </p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">
            In Progress
          </p>
          <p className="mt-1 font-display text-2xl italic tracking-tight text-amber-800">
            {stats.inProgressCount}
          </p>
          <p className="mt-1 text-[10px] text-muted">Retries and reminders active</p>
        </div>

        <div className="card p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted font-medium">
            Action Required
          </p>
          <p className={`mt-1 font-display text-2xl italic tracking-tight ${stats.actionNeededCount > 0 ? "text-red-700" : "text-foreground"}`}>
            {stats.actionNeededCount}
          </p>
          <p className="mt-1 text-[10px] text-muted">Needs your attention</p>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-1">
          <FilterButton
            active={filter === "all"}
            label="All Payments"
            count={stats.total}
            onClick={() => setFilter("all")}
          />
          <FilterButton
            active={filter === "recovered"}
            label="Successful"
            count={stats.recoveredCount}
            onClick={() => setFilter("recovered")}
          />
          <FilterButton
            active={filter === "in_progress"}
            label="In Progress"
            count={stats.inProgressCount}
            onClick={() => setFilter("in_progress")}
          />
          <FilterButton
            active={filter === "action_needed"}
            label="Needs Action"
            count={stats.actionNeededCount}
            onClick={() => setFilter("action_needed")}
          />
        </div>

        <div className="w-full sm:w-64">
          <input
            id="customer-payment-search"
            type="search"
            placeholder="Search by ID, bank, method..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
          />
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 && (
        <div className="card p-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center">
            <span className="font-display text-xl italic font-bold text-accent">R</span>
          </div>
          <h2 className="font-display text-xl italic text-foreground">
            {payments.length === 0 ? "No payment records found" : "No payments match this filter"}
          </h2>
          <p className="text-sm text-muted max-w-md mx-auto">
            {payments.length === 0
              ? "Your account currently has no past transactions or failed payments. Once charges are processed by your merchant, they will automatically appear here."
              : "Try switching to 'All Payments' or clearing your search query."}
          </p>
          {payments.length > 0 && filter !== "all" && (
            <button
              type="button"
              onClick={() => { setFilter("all"); setSearch(""); }}
              className="mt-2 text-xs text-accent underline-offset-2 hover:underline"
            >
              Show all payments
            </button>
          )}
        </div>
      )}

      {/* Payments List */}
      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((payment) => {
            const statusInfo = getPlainStatus(payment);
            return (
              <div
                key={payment.id}
                className="card card-hover p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display font-medium text-base text-foreground">
                      {formatInrFromPaise(payment.amountPaise)}
                    </span>
                    <span className="text-muted text-xs">·</span>
                    <span className="text-xs text-muted uppercase tracking-wider font-mono">
                      {payment.id}
                    </span>
                    <span className={statusInfo.badgeClass}>
                      {statusInfo.badgeLabel}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-foreground">
                    {statusInfo.title}
                  </p>

                  <p className="text-xs text-muted leading-relaxed">
                    {statusInfo.explanation}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted">
                    <span>Method: {payment.paymentMethod.toUpperCase()} ({payment.bank})</span>
                    <span>·</span>
                    <span>Date: {formatDateTime(payment.failedAt)}</span>
                    {payment.retryCount > 0 && (
                      <>
                        <span>·</span>
                        <span>{payment.retryCount} of 3 attempts used</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  <Link
                    href={`/payment/${payment.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-accent/40 bg-accent-muted/30 px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-accent-muted transition-colors"
                  >
                    View Details
                    <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:text-foreground hover:bg-background"
      }`}
    >
      {label} <span className="opacity-75">({count})</span>
    </button>
  );
}
