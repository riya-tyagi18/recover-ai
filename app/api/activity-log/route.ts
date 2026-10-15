import { readStore } from "@/lib/db/store";
import { requireOwner } from "@/lib/auth/guard";

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const store = await readStore();

  const paymentMap = new Map(store.payments.map((p) => [p.id, p]));
  const customerMap = new Map(store.customers.map((c) => [c.id, c]));
  const failureMap = new Map(store.failureEvents.map((f) => [f.paymentId, f]));

  const logs = store.auditLogs
    .filter((l) => l.paymentId !== null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 500);

  const rows = logs.map((log) => {
    const payment = log.paymentId ? paymentMap.get(log.paymentId) : undefined;
    const customer = payment ? customerMap.get(payment.customerId) : undefined;
    const failure = log.paymentId ? failureMap.get(log.paymentId) : undefined;
    return { log, payment, customer, failure };
  });

  return Response.json({ rows });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return Response.json({ error: message }, { status });
  }
}
