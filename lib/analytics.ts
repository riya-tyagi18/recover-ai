/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { readStore } from "@/lib/db/store";
import { FailureCategory, Payment, StrategyId } from "@/lib/types";

export type BatchAnalytics = {
  totalPayments: number;
  valueAtRiskPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
  averageRetries: number;
  statusBreakdown: {
    recovering: number;
    recovered: number;
    stopped: number;
    failed: number;
  };
  reasonBreakdown: Record<string, number>;
  strategyPerformance: Record<
    string,
    {
      count: number;
      recoveredCount: number;
      recoveryRate: number;
      recoveredPaise: number;
    }
  >;
};

export async function getBatchAnalytics(batchId: string): Promise<BatchAnalytics> {
  const store = await readStore();
  const payments = store.payments.filter((p) => p.batchId === batchId);
  const failures = store.failureEvents.filter((f) => payments.some((p) => p.id === f.paymentId));
  const assignments = store.experimentAssignments.filter((a) =>
    payments.some((p) => p.id === a.paymentId)
  );

  const totalPayments = payments.length;
  let valueAtRiskPaise = 0;
  let recoveredPaise = 0;
  let totalRetries = 0;
  const statusBreakdown = { recovering: 0, recovered: 0, stopped: 0, failed: 0 };
  const reasonBreakdown: Record<string, number> = {};
  
  const strategyPerformance: Record<string, any> = {};

  for (const payment of payments) {
    valueAtRiskPaise += payment.amountPaise;
    totalRetries += payment.retryCount;
    statusBreakdown[payment.status as keyof typeof statusBreakdown] =
      (statusBreakdown[payment.status as keyof typeof statusBreakdown] || 0) + 1;

    if (payment.status === "recovered") {
      recoveredPaise += payment.recoveredAmountPaise || payment.amountPaise;
    }

    const failure = failures.find((f) => f.paymentId === payment.id);
    if (failure) {
      reasonBreakdown[failure.category] = (reasonBreakdown[failure.category] || 0) + 1;
    }

    const assignment = assignments.find((a) => a.paymentId === payment.id);
    const strategy = assignment?.strategy || payment.assignedStrategy || "unknown";
    
    if (!strategyPerformance[strategy]) {
      strategyPerformance[strategy] = { count: 0, recoveredCount: 0, recoveredPaise: 0, recoveryRate: 0 };
    }
    
    strategyPerformance[strategy].count += 1;
    if (payment.status === "recovered") {
      strategyPerformance[strategy].recoveredCount += 1;
      strategyPerformance[strategy].recoveredPaise += (payment.recoveredAmountPaise || payment.amountPaise);
    }
  }

  for (const strat in strategyPerformance) {
    const s = strategyPerformance[strat];
    s.recoveryRate = s.count > 0 ? (s.recoveredCount / s.count) * 100 : 0;
  }

  return {
    totalPayments,
    valueAtRiskPaise,
    recoveredPaise,
    recoveryRate: totalPayments > 0 ? (statusBreakdown.recovered / totalPayments) * 100 : 0,
    averageRetries: totalPayments > 0 ? totalRetries / totalPayments : 0,
    statusBreakdown,
    reasonBreakdown,
    strategyPerformance,
  };
}
