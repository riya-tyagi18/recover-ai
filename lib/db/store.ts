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
};

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL_URL;
const DATA_DIR = isVercel ? path.join(os.tmpdir(), "recover-ai-data") : path.join(process.cwd(), ".data");
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
  };
}

async function loadStore(): Promise<StoreData> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    return { ...emptyStore(), ...(JSON.parse(raw) as StoreData) };
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

export function readStore(): Promise<StoreData> {
  return queue.then(() => loadStore());
}
