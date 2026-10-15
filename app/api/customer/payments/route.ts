import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { getCustomerPayments } from "@/lib/db/auth-store";
import { readStore } from "@/lib/db/store";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);

    // If user has no customerId associated yet, return empty list
    if (!user.customerId) {
      return NextResponse.json({ payments: [], customer: null });
    }

    const store = await readStore();
    const customer = store.customers.find((c) => c.id === user.customerId) || null;
    const payments = await getCustomerPayments(user.customerId);

    // Enrich with failure information and audit trail
    const failuresMap = new Map(store.failureEvents.map((f) => [f.paymentId, f]));
    const enriched = payments.map((p) => {
      const failure = failuresMap.get(p.id) || null;
      return {
        ...p,
        failureReason: failure?.reason ?? "Payment attempt was declined by the bank.",
        failureCategory: failure?.category ?? "bank_issue",
      };
    });

    return NextResponse.json({
      customer,
      payments: enriched,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }
}
