import type { Customer, FailureEvent, Payment } from "@/lib/types";

export type PaymentRow = Payment & {
  customer: Customer;
  failure: FailureEvent;
};

export type BatchSummary = {
  id: string;
  seed: number;
  paymentCount: number;
  createdAt: string;
  status: "generated" | "running" | "paused" | "completed" | "failed";
  valueAtRiskPaise: number;
};

export type BatchDetail = BatchSummary & {
  payments: PaymentRow[];
};
