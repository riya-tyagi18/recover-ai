import { redirect } from "next/navigation";
import Link from "next/link";
import { validateSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { getCustomerPayments } from "@/lib/db/auth-store";
import { formatDateTime, formatInrFromPaise } from "@/lib/format";
import { CustomerDashboardClient } from "./CustomerDashboardClient";
import type { Payment, FailureEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Payments — Recover AI",
  description: "View your personal payment history, status updates, and recovery progress.",
};

export default async function CustomerDashboardPage() {
  const sessionResult = await validateSession();
  if (!sessionResult) {
    redirect("/login");
  }

  const { user } = sessionResult;
  const store = await readStore();

  let payments: Payment[] = [];
  let customerName = user.name;

  if (user.customerId) {
    payments = await getCustomerPayments(user.customerId);
    const customer = store.customers.find((c) => c.id === user.customerId);
    if (customer) {
      customerName = customer.name;
    }
  }

  const failuresMap = new Map(store.failureEvents.map((f: FailureEvent) => [f.paymentId, f]));
  const enrichedPayments = payments.map((p) => {
    const failure = failuresMap.get(p.id) || null;
    return {
      ...p,
      failureReason: failure?.reason ?? "Temporary bank processing error.",
      failureCategory: failure?.category ?? "bank_issue",
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl italic tracking-tight text-foreground">
              My Payments
            </h1>
            <span className="badge-recovered text-xs font-medium">Customer Portal</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Welcome back, <span className="font-semibold text-foreground">{customerName}</span>. Track your subscription payments, automatic recoveries, and required actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Account:</span>
          <span className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-mono text-foreground">
            {user.email}
          </span>
        </div>
      </header>

      {/* Interactive client dashboard with filters and plain-language recovery cards */}
      <CustomerDashboardClient payments={enrichedPayments} />
    </div>
  );
}
