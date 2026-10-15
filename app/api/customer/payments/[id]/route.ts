import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { readStore } from "@/lib/db/store";
import { logAuthEvent } from "@/lib/db/auth-store";
import { getClientIp, getUserAgent } from "@/lib/auth/session";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth(request);
    const { id } = await context.params;

    const store = await readStore();
    const payment = store.payments.find((p) => p.id === id);

    if (!payment) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    // IDOR Protection:
    // If caller has role 'user', they can ONLY view their own payment.
    if (user.role === "user") {
      if (!user.customerId || payment.customerId !== user.customerId) {
        await logAuthEvent({
          userId: user.id,
          event: "access_denied",
          ip: getClientIp(request),
          userAgent: getUserAgent(request),
          detail: {
            reason: "IDOR attempt prevented: payment does not belong to session customer",
            requestedPaymentId: id,
            sessionCustomerId: user.customerId,
            targetCustomerId: payment.customerId,
          },
        });
        return NextResponse.json(
          { error: "Forbidden. You do not have permission to view this payment." },
          { status: 403 },
        );
      }
    }

    const customer = store.customers.find((c) => c.id === payment.customerId) || null;
    const failure = store.failureEvents.find((f) => f.paymentId === payment.id) || null;
    const logs = store.auditLogs.filter((l) => l.paymentId === payment.id);

    return NextResponse.json({
      payment,
      customer,
      failure,
      logs,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return NextResponse.json({ error: message }, { status });
  }
}
