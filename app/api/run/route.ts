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

    // Since mutateStore locks the queue, we shouldn't do slow external fetches inside it.
    // However, for hackathon purposes and since there's no other DB, we'll fetch the payments,
    // process them sequentially, and then mutate the store once at the end, or mutate per payment.
    // Let's do it outside to avoid holding the lock for a long time.
    
    // First, read the payments we need to process
    let paymentsToProcess: Payment[] = [];
    let customersMap = new Map();
    let failuresMap = new Map();

    await mutateStore(async (store) => {
      const run = store.agentRuns.find((r) => r.id === batchId);
      if (run) {
        run.status = "running";
      }

      paymentsToProcess = store.payments.filter(
        (p) => p.batchId === batchId && p.status !== "recovered" && p.status !== "stopped"
      );
      
      store.customers.forEach(c => customersMap.set(c.id, c));
      store.failureEvents.forEach(f => failuresMap.set(f.paymentId, f));
    });

    // Process sequentially to not overwhelm the Python backend
    const results: { paymentId: string; data: any }[] = [];
    for (const payment of paymentsToProcess) {
      const customer = customersMap.get(payment.customerId);
      const failure = failuresMap.get(payment.id);

      if (!customer || !failure) continue;

      try {
        const res = await fetch("http://127.0.0.1:8000/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment, customer, failure }),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({ paymentId: payment.id, data });
        } else {
          console.error("Agent failed for payment", payment.id);
        }
      } catch (err) {
        console.error("Failed to fetch agent for payment", payment.id, err);
      }
    }

    // Now update the store with the results
    await mutateStore(async (store) => {
      for (const result of results) {
        const { paymentId, data } = result;
        const pIdx = store.payments.findIndex(p => p.id === paymentId);
        if (pIdx >= 0) {
          const p = store.payments[pIdx];
          
          // Update payment state
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

          // Add audit logs
          if (data.audit_logs && Array.isArray(data.audit_logs)) {
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
          
          // Hinglish nudge
          if (data.strategy === "nudge_then_retry") {
            const failure = store.failureEvents.find((f) => f.paymentId === paymentId);
            const category = failure?.category;
            let msg = "Hi! Looks like your last payment failed. Please check your account.";
            if (category === "insufficient_funds") msg = "Hi! Aapke account me balance kam hone ke kaaran payment fail ho gayi. Please recharge kijiye.";
            else if (category === "card_expired") msg = "Hi! Aapka card expire ho gaya hai. Please naya card add karein.";
            
            store.auditLogs.push({
              id: `aud_${paymentId}_nudge_${Date.now()}`,
              paymentId,
              runId: batchId,
              at: new Date().toISOString(),
              action: "nudge.sent",
              reason: "Simulated Hinglish WhatsApp Nudge",
              detail: { message: msg },
            });
          }
        }
      }

      // Mark run as completed
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
