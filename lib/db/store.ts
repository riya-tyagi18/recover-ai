import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type {
  AbExperiment,
  AgentRun,
  AuditLog,
  Customer,
  ExperimentAssignment,
  FailureEvent,
  Payment,
  PaymentAttempt,
  RecoveryAction,
  RecoveryDecision,
  User,
  Session,
  RateLimitRecord,
  PasswordResetToken,
  EmailOtp,
  AuthAuditLog,
} from "@/lib/types";

export type StoreData = {
  customers: Customer[];
  payments: Payment[];
  failureEvents: FailureEvent[];
  paymentAttempts: PaymentAttempt[];
  recoveryDecisions: RecoveryDecision[];
  recoveryActions: RecoveryAction[];
  agentRuns: AgentRun[];
  abExperiments: AbExperiment[];
  experimentAssignments: ExperimentAssignment[];
  auditLogs: AuditLog[];
  users: User[];
  sessions: Session[];
  rateLimits: RateLimitRecord[];
  passwordResets: PasswordResetToken[];
  emailOtps: EmailOtp[];
  authAuditLogs: AuthAuditLog[];
};

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_URL;
const DATA_DIR = isVercel
  ? path.join(os.tmpdir(), "recover-ai-data")
  : path.join(process.cwd(), ".data");
const DATA_PATH = path.join(DATA_DIR, "store.json");

function emptyStore(): StoreData {
  return {
    customers: [],
    payments: [],
    failureEvents: [],
    paymentAttempts: [],
    recoveryDecisions: [],
    recoveryActions: [],
    agentRuns: [],
    abExperiments: [],
    experimentAssignments: [],
    auditLogs: [],
    users: [],
    sessions: [],
    rateLimits: [],
    passwordResets: [],
    emailOtps: [],
    authAuditLogs: [],
  };
}

/**
 * Auto-seed the store with 100 synthetic payments (seed=42) when empty.
 * This ensures Dashboard / Strategy Comparison / Activity Log always have
 * data to show — even after a Vercel cold-start that wipes tmpdir.
 * Data is 100% synthetic and modelled on real Razorpay failure codes.
 */
async function seedIfEmpty(store: StoreData): Promise<void> {
  if (store.payments.length > 0) return; // already has data

  const { generateFailedPaymentBatch } = await import(
    "@/lib/simulation/generate"
  );
  const { runAgent } = await import("@/lib/agent/process");

  const SEED = 42;
  const COUNT = 100;
  const generated = generateFailedPaymentBatch(SEED, COUNT);

  const run: AgentRun = {
    id: generated.batchId,
    runType: "seed",
    seed: SEED,
    paymentCount: COUNT,
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
    reason: `Auto-seeded ${COUNT} synthetic payments (seed ${SEED}). Sample data — not real merchant data.`,
    detail: { seed: SEED, count: COUNT, source: "auto-seed" },
  });

  // Run the in-process agent on every payment so statuses are populated
  const customerMap = new Map(store.customers.map((c) => [c.id, c]));
  const failureMap = new Map(store.failureEvents.map((f) => [f.paymentId, f]));

  for (const payment of store.payments.filter((p) => p.batchId === generated.batchId)) {
    const customer = customerMap.get(payment.customerId);
    const failure = failureMap.get(payment.id);
    if (!customer || !failure) continue;

    try {
      const data = runAgent(payment, customer, failure);
      const p = store.payments.find((x) => x.id === payment.id)!;

      if (data.is_stopped) {
        p.status = data.stop_reason === "recovered" ? "recovered" : "stopped";
        p.stopReason = data.stop_reason;
        if (p.status === "recovered") {
          p.recoveredAmountPaise = p.amountPaise;
          p.recoveredAt =
            (data.action_result as { executed_at?: string } | null)?.executed_at ??
            generated.createdAt;
        }
      } else {
        p.status = "recovering";
        p.retryCount += 1;
      }

      if (Array.isArray(data.audit_logs)) {
        (data.audit_logs as { at: string; action: string; reason: string; detail: unknown }[]).forEach(
          (log, idx) => {
            store.auditLogs.push({
              id: `aud_${payment.id}_seed_${idx}`,
              paymentId: payment.id,
              runId: generated.batchId,
              at: log.at,
              action: log.action,
              reason: log.reason,
              detail: log.detail,
            });
          }
        );
      }
    } catch {
      // skip individual payment errors during seeding
    }
  }

  // Mark batch completed
  const r = store.agentRuns.find((x) => x.id === generated.batchId);
  if (r) {
    r.status = "completed";
    r.completedAt = new Date().toISOString();
  }
}

async function loadStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      ...emptyStore(),
      ...parsed,
      users: parsed.users ?? [],
      sessions: parsed.sessions ?? [],
      rateLimits: parsed.rateLimits ?? [],
      passwordResets: parsed.passwordResets ?? [],
      emailOtps: parsed.emailOtps ?? [],
      authAuditLogs: parsed.authAuditLogs ?? [],
    };
  } catch {
    return emptyStore();
  }
}

async function saveStore(store: StoreData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_PATH, JSON.stringify(store, null, 2), "utf8");
}

let queue: Promise<unknown> = Promise.resolve();

export function mutateStore<T>(fn: (store: StoreData) => T | Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const store = await loadStore();
    await seedIfEmpty(store);
    const result = await fn(store);
    await saveStore(store);
    return result;
  });
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function readStore(): Promise<StoreData> {
  return queue.then(async () => {
    const store = await loadStore();
    if (store.payments.length === 0) {
      await seedIfEmpty(store);
      await saveStore(store);
    }
    return store;
  });
}
