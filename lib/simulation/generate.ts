import type {
  AbExperiment,
  Customer,
  ExperimentAssignment,
  FailureCategory,
  FailureEvent,
  Payment,
  PaymentMethod,
  StrategyId,
} from "../types";
import { STRATEGIES } from "../types";
import { intBetween, mulberry32, pick, weightedPick } from "./rng";

const FIRST_NAMES = [
  "Aarav",
  "Priya",
  "Rohan",
  "Ananya",
  "Vikram",
  "Ishita",
  "Kabir",
  "Sneha",
  "Arjun",
  "Meera",
  "Dev",
  "Nisha",
  "Rahul",
  "Diya",
  "Karan",
  "Aditi",
  "Siddharth",
  "Pooja",
  "Nikhil",
  "Tanya",
  "Ayaan",
  "Riya",
  "Harsh",
  "Kavya",
  "Manish",
  "Shreya",
  "Yash",
  "Neha",
  "Amit",
  "Lakshmi",
  "Farhan",
  "Sana",
  "Pranav",
  "Isha",
  "Varun",
  "Anjali",
  "Rohit",
  "Tanvi",
  "Gaurav",
  "Pallavi",
] as const;

const LAST_NAMES = [
  "Mehta",
  "Sharma",
  "Iyer",
  "Reddy",
  "Singh",
  "Kapoor",
  "Nair",
  "Joshi",
  "Malhotra",
  "Pillai",
  "Patel",
  "Banerjee",
  "Khanna",
  "Menon",
  "Desai",
  "Rao",
  "Bose",
  "Kulkarni",
  "Verma",
  "Ghosh",
] as const;

const BANKS = [
  "HDFC Bank",
  "ICICI Bank",
  "SBI",
  "Axis Bank",
  "Kotak Mahindra",
  "Yes Bank",
  "IDFC First",
] as const;

const FAILURE_COPY: Record<FailureCategory, string> = {
  insufficient_funds: "Bank declined the debit: insufficient funds in the account.",
  card_expired: "Card expired before the subscription billing date.",
  card_declined: "Issuing bank declined the card without a funds reason.",
  bank_issue: "Customer's bank returned a temporary processing error.",
  network_temporary: "Network timeout between gateway and issuing bank.",
  gateway_issue: "Payment gateway returned a transient 5xx during capture.",
  incorrect_details: "Saved instrument details are invalid or incomplete.",
};

const CATEGORY_WEIGHTS: { value: FailureCategory; weight: number }[] = [
  { value: "insufficient_funds", weight: 32 },
  { value: "card_expired", weight: 14 },
  { value: "card_declined", weight: 18 },
  { value: "bank_issue", weight: 12 },
  { value: "network_temporary", weight: 10 },
  { value: "gateway_issue", weight: 8 },
  { value: "incorrect_details", weight: 6 },
];

const AMOUNTS_PAISE = [
  19_900, 29_900, 49_900, 79_900, 99_900, 1_49_900, 1_99_900, 2_99_900, 4_99_900,
  9_99_900,
];

const HIGH_VALUE_AMOUNTS = [2_99_900, 4_99_900, 9_99_900, 14_99_900];

const DEFAULT_EXPERIMENT_ID = "exp_strategy_v1";

export type GeneratedBatch = {
  batchId: string;
  seed: number;
  count: number;
  createdAt: string;
  experiment: AbExperiment;
  customers: Customer[];
  payments: Payment[];
  failureEvents: FailureEvent[];
  assignments: ExperimentAssignment[];
};

export function generateFailedPaymentBatch(
  seed: number,
  count: number,
  createdAt = new Date("2026-08-28T10:00:00.000Z"),
): GeneratedBatch {
  const rng = mulberry32(seed);
  const batchId = `batch_${seed}_${count}`;
  const createdIso = createdAt.toISOString();

  const experiment: AbExperiment = {
    id: DEFAULT_EXPERIMENT_ID,
    name: "Recovery strategy A/B (v1)",
    strategies: [...STRATEGIES],
    createdAt: createdIso,
  };

  const customers: Customer[] = [];
  const payments: Payment[] = [];
  const failureEvents: FailureEvent[] = [];
  const assignments: ExperimentAssignment[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const segment = weightedPick(rng, [
      { value: "high_value" as const, weight: 15 },
      { value: "standard" as const, weight: 50 },
      { value: "at_risk" as const, weight: 20 },
      { value: "new" as const, weight: 15 },
    ]);

    const method = weightedPick(rng, [
      { value: "card" as const, weight: 55 },
      { value: "upi" as const, weight: 30 },
      { value: "netbanking" as const, weight: 10 },
      { value: "wallet" as const, weight: 5 },
    ]);

    const bank = pick(rng, BANKS);
    const priorSuccessCount =
      segment === "new" ? intBetween(rng, 0, 1) : intBetween(rng, 2, 18);
    const priorAttempts =
      priorSuccessCount + intBetween(rng, 0, segment === "at_risk" ? 8 : 3);
    const priorSuccessRate =
      priorAttempts === 0 ? 0 : Number((priorSuccessCount / priorAttempts).toFixed(2));

    const customer: Customer = {
      id: `cust_${seed}_${String(i).padStart(3, "0")}`,
      name: uniqueName(rng, usedNames, i),
      segment,
      priorSuccessCount,
      priorSuccessRate,
      paymentMethod: method,
      bank,
      createdAt: createdIso,
    };
    customers.push(customer);

    const amountPaise =
      segment === "high_value"
        ? pick(rng, HIGH_VALUE_AMOUNTS)
        : pick(rng, AMOUNTS_PAISE);

    const category = pickCategory(rng, method);
    const retryCount = intBetween(rng, 0, 2);
    const priorFailureCount =
      segment === "at_risk" ? intBetween(rng, 1, 4) : intBetween(rng, 0, 2);

    const failedOffsetHours = intBetween(rng, 1, 72);
    const failedAt = new Date(
      createdAt.getTime() - failedOffsetHours * 60 * 60 * 1000,
    ).toISOString();

    const assignedStrategy = STRATEGIES[i % STRATEGIES.length] as StrategyId;
    const paymentId = `pay_${seed}_${String(i).padStart(3, "0")}`;

    const payment: Payment = {
      id: paymentId,
      customerId: customer.id,
      batchId,
      subscriptionId: `sub_${seed}_${String(i).padStart(3, "0")}`,
      amountPaise,
      currency: "INR",
      paymentMethod: method,
      bank,
      retryCount,
      priorFailureCount,
      status: "failed",
      recoveredAmountPaise: 0,
      recoveredAt: null,
      stopReason: null,
      subscriptionValuePaise: amountPaise * 12,
      failedAt,
      assignedStrategy,
    };
    payments.push(payment);

    failureEvents.push({
      id: `fail_${paymentId}`,
      paymentId,
      reason: FAILURE_COPY[category],
      category,
      occurredAt: failedAt,
    });

    assignments.push({
      id: `asg_${paymentId}`,
      experimentId: experiment.id,
      paymentId,
      strategy: assignedStrategy,
    });
  }

  return {
    batchId,
    seed,
    count,
    createdAt: createdIso,
    experiment,
    customers,
    payments,
    failureEvents,
    assignments,
  };
}

function uniqueName(rng: () => number, used: Set<string>, index: number): string {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const name = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)} ${index + 1}`;
  used.add(fallback);
  return fallback;
}

function pickCategory(rng: () => number, method: PaymentMethod): FailureCategory {
  if (method === "upi") {
    return weightedPick(rng, [
      { value: "insufficient_funds", weight: 40 },
      { value: "bank_issue", weight: 20 },
      { value: "network_temporary", weight: 20 },
      { value: "gateway_issue", weight: 12 },
      { value: "incorrect_details", weight: 8 },
    ]);
  }
  if (method === "card") {
    return weightedPick(rng, CATEGORY_WEIGHTS);
  }
  return weightedPick(rng, [
    { value: "bank_issue", weight: 28 },
    { value: "network_temporary", weight: 22 },
    { value: "gateway_issue", weight: 20 },
    { value: "insufficient_funds", weight: 20 },
    { value: "incorrect_details", weight: 10 },
  ]);
}
