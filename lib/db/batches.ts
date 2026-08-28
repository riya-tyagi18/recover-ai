import { mutateStore, readStore } from "@/lib/db/store";
import { generateFailedPaymentBatch } from "@/lib/simulation/generate";
import type { AgentRun, Payment } from "@/lib/types";
import type { BatchDetail, BatchSummary } from "@/lib/batch-types";

export type { BatchDetail, BatchSummary };

function toSummary(run: AgentRun, payments: Payment[]): BatchSummary {
  return {
    id: run.id,
    seed: run.seed ?? 0,
    paymentCount: run.paymentCount,
    createdAt: run.startedAt,
    status: run.status,
    valueAtRiskPaise: payments
      .filter((p) => p.batchId === run.id)
      .reduce((sum, p) => sum + p.amountPaise, 0),
  };
}

export async function listBatches(): Promise<BatchSummary[]> {
  const store = await readStore();
  const seeds = store.agentRuns
    .filter((run) => run.runType === "seed")
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  return seeds.map((run) => toSummary(run, store.payments));
}

export async function getBatch(batchId: string): Promise<BatchDetail | null> {
  const store = await readStore();
  const run = store.agentRuns.find((r) => r.id === batchId && r.runType === "seed");
  if (!run) return null;

  const customers = new Map(store.customers.map((c) => [c.id, c]));
  const failures = new Map(store.failureEvents.map((f) => [f.paymentId, f]));
  const payments = store.payments
    .filter((p) => p.batchId === batchId)
    .map((payment) => {
      const customer = customers.get(payment.customerId);
      const failure = failures.get(payment.id);
      if (!customer || !failure) {
        throw new Error(`Incomplete payment record: ${payment.id}`);
      }
      return { ...payment, customer, failure };
    });

  return { ...toSummary(run, store.payments), payments };
}

export async function getLatestBatch(): Promise<BatchDetail | null> {
  const batches = await listBatches();
  if (batches.length === 0) return null;
  return getBatch(batches[0]!.id);
}

export async function createOrReuseBatch(
  seed: number,
  count: number,
): Promise<{ batch: BatchDetail; reused: boolean }> {
  return mutateStore(async (store) => {
    const existing = store.agentRuns.find(
      (run) => run.runType === "seed" && run.seed === seed && run.paymentCount === count,
    );
    if (existing) {
      const customers = new Map(store.customers.map((c) => [c.id, c]));
      const failures = new Map(store.failureEvents.map((f) => [f.paymentId, f]));
      const payments = store.payments
        .filter((p) => p.batchId === existing.id)
        .map((payment) => ({
          ...payment,
          customer: customers.get(payment.customerId)!,
          failure: failures.get(payment.id)!,
        }));
      return { batch: { ...toSummary(existing, store.payments), payments }, reused: true };
    }

    const generated = generateFailedPaymentBatch(seed, count);
    const run: AgentRun = {
      id: generated.batchId,
      runType: "seed",
      seed,
      paymentCount: count,
      status: "generated",
      startedAt: generated.createdAt,
      completedAt: generated.createdAt,
      parentBatchId: null,
    };

    store.agentRuns.push(run);
    store.customers.push(...generated.customers);
    store.payments.push(...generated.payments);
    store.failureEvents.push(...generated.failureEvents);
    store.experimentAssignments.push(...generated.assignments);
    if (!store.abExperiments.some((e) => e.id === generated.experiment.id)) {
      store.abExperiments.push(generated.experiment);
    }
    store.auditLogs.push({
      id: `aud_${generated.batchId}_seed`,
      paymentId: null,
      runId: generated.batchId,
      at: generated.createdAt,
      action: "batch.generated",
      reason: `Seeded ${count} failed payments with seed ${seed}. Same seed always produces this batch.`,
      detail: { seed, count, source: "simulation" },
    });

    return {
      batch: {
        ...toSummary(run, generated.payments),
        payments: generated.payments.map((payment) => ({
          ...payment,
          customer: generated.customers.find((c) => c.id === payment.customerId)!,
          failure: generated.failureEvents.find((f) => f.paymentId === payment.id)!,
        })),
      },
      reused: false,
    };
  });
}
