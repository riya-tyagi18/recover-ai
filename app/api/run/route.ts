/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */
import { mutateStore } from "@/lib/db/store";
import { NextResponse } from "next/server";
import { Payment } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { batchId } = await request.json();
    if (!batchId) {
      return NextResponse.json({ error: "Missing batchId" }, { status: 400 });
    }

    let paymentsToProcess: Payment[] = [];
    let customersMap = new Map();
    let failuresMap = new Map();

    await mutateStore(async (store) => {
      const run = store.agentRuns.find((r) => r.id === batchId);
      if (run) run.status = "running";
      paymentsToProcess = store.payments.filter(
        (p) => p.batchId === batchId && p.status !== "recovered" && p.status !== "stopped"
      );
      store.customers.forEach(c => customersMap.set(c.id, c));
      store.failureEvents.forEach(f => failuresMap.set(f.paymentId, f));
    });

    const results: { paymentId: string; data: any }[] = [];
    const { runAgent } = await import("@/lib/agent/process");

    for (const payment of paymentsToProcess) {
      const customer = customersMap.get(payment.customerId);
      const failure = failuresMap.get(payment.id);
      if (!customer || !failure) continue;

      try {
        // Try Python backend first; fall back to in-process TS agent
        let data: any = null;
        try {
          const res = await fetch("http://127.0.0.1:8000/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment, customer, failure }),
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) data = await res.json();
        } catch {
          // Python backend unavailable — using in-process TS agent
        }

        if (!data) {
          data = runAgent(payment, customer, failure);
        }

        results.push({ paymentId: payment.id, data });
      } catch (err) {
        console.error("Failed to process payment", payment.id, err);
      }
    }

    await mutateStore(async (store) => {
      for (const result of results) {
        const { paymentId, data } = result;
        const pIdx = store.payments.findIndex(p => p.id === paymentId);
        if (pIdx >= 0) {
          const p = store.payments[pIdx]!;

          if (data.is_stopped) {
            p.status = data.stop_reason === "recovered" ? "recovered" : "stopped";
            p.stopReason = data.stop_reason;
            if (p.status === "recovered") {
              p.recoveredAmountPaise = p.amountPaise;
              p.recoveredAt = data.action_result?.executed_at || new Date().toISOString();
            }
          } else {
            p.status = "recovering";
            p.retryCount += 1;
          }

          if (Array.isArray(data.audit_logs)) {
            data.audit_logs.forEach((log: any, idx: number) => {
              store.auditLogs.push({
                id: `aud_${paymentId}_${Date.now()}_${idx}`,
                paymentId,
                runId: batchId,
                at: log.at,
                action: log.action,
                reason: log.reason,
                detail: log.detail,
              });
            });
          }
        }
      }

      const run = store.agentRuns.find((r) => r.id === batchId);
      if (run) {
        run.status = "completed";
        run.completedAt = new Date().toISOString();
      }
    });

    return NextResponse.json({ success: true, processedCount: results.length });
  } catch (error: any) {
    console.error("Run error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
