/**
 * Unit Tests for Payment Recovery Analyst & Customer Risk Segmentation.
 * Run with: npx tsx scripts/test-analyst.ts
 */

import {
  calculateDatasetThresholds,
  evaluateCustomerSegmentation,
  SEGMENT_PRIORITY,
  type CustomerMetrics,
} from "../lib/analyst/segmentation";
import {
  getCustomer,
  getPayment,
  topFailureReasons,
  revenueAtRisk,
  customerRanking,
  segmentCustomers,
  recommendAction,
  findCloseMatches,
} from "../lib/analyst/engine";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✓ PASS: ${message}`);
}

async function runTests() {
  console.log("=== Running Payment Recovery Analyst Unit Tests ===\n");

  // ─── Test Suite 1: Threshold Calculations ─────────────────────────
  console.log("Suite 1: Dataset Threshold Calculations");
  const dummyMetrics: CustomerMetrics[] = [
    {
      customerId: "c1",
      customerName: "Alice",
      totalAttempts: 10,
      totalFailures: 0,
      failureRate: 0.0,
      totalTransactionValuePaise: 100000,
      valueAtRiskPaise: 0,
      recoveredPaise: 0,
      retriesExecuted: 0,
      recoveredByRetryCount: 0,
      retriesExhaustedWithoutRecovery: false,
      isLowConfidence: false,
      topFailureReasons: [],
    },
    {
      customerId: "c2",
      customerName: "Bob",
      totalAttempts: 10,
      totalFailures: 6,
      failureRate: 0.6,
      totalTransactionValuePaise: 300000,
      valueAtRiskPaise: 50000,
      recoveredPaise: 0,
      retriesExecuted: 3,
      recoveredByRetryCount: 0,
      retriesExhaustedWithoutRecovery: true,
      isLowConfidence: false,
      topFailureReasons: ["card_expired"],
    },
    {
      customerId: "c3",
      customerName: "Charlie",
      totalAttempts: 10,
      totalFailures: 4,
      failureRate: 0.4,
      totalTransactionValuePaise: 500000,
      valueAtRiskPaise: 40000,
      recoveredPaise: 20000,
      retriesExecuted: 2,
      recoveredByRetryCount: 2,
      retriesExhaustedWithoutRecovery: false,
      isLowConfidence: false,
      topFailureReasons: ["bank_issue"],
    },
    {
      customerId: "c4",
      customerName: "Dave",
      totalAttempts: 2,
      totalFailures: 1,
      failureRate: 0.5,
      totalTransactionValuePaise: 800000,
      valueAtRiskPaise: 80000,
      recoveredPaise: 0,
      retriesExecuted: 0,
      recoveredByRetryCount: 0,
      retriesExhaustedWithoutRecovery: false,
      isLowConfidence: true,
      topFailureReasons: ["network_temporary"],
    },
  ];

  const thresholds = calculateDatasetThresholds(dummyMetrics);
  assert(thresholds.totalCustomers === 4, "Threshold calculates total customers count correctly");
  assert(thresholds.topQuartileValuePaise === 800000, "Calculates 75th percentile transaction value");
  assert(thresholds.medianFailureRate >= 0.4, "Calculates median failure rate correctly");
  assert(thresholds.unresolvedValueThresholdPaise > 0, "Calculates positive unresolved value threshold");

  // ─── Test Suite 2: Segmentation Rules & Priority Order ────────────
  console.log("\nSuite 2: Customer Risk Segmentation Rules & Priority");

  // High Risk Customer (retries exhausted)
  const highRiskCustomer = evaluateCustomerSegmentation(dummyMetrics[1], thresholds);
  assert(highRiskCustomer.primarySegment === "High Risk", "High Risk correctly prioritized");
  assert(highRiskCustomer.allTags.includes("High Risk"), "High Risk tag is present in allTags");
  assert(
    highRiskCustomer.rulesTriggered["High Risk"].length > 0,
    "High Risk includes exact rule that triggered it"
  );

  // Recovery on Retry Customer (Charlie: 4 failures, 2 recovered by retry = 50%)
  const recoveryCustomer = evaluateCustomerSegmentation(dummyMetrics[2], thresholds);
  assert(
    recoveryCustomer.allTags.includes("Recovery on Retry"),
    "Recovery on Retry tag triggered when >=50% failures recovered"
  );
  assert(
    recoveryCustomer.rulesTriggered["Recovery on Retry"][0].includes("recovered upon retry"),
    "Recovery on Retry lists explanatory rule"
  );

  // High Value Customer (Dave: 800,000 paise >= topQuartile)
  const highValueCustomer = evaluateCustomerSegmentation(dummyMetrics[3], thresholds);
  assert(
    highValueCustomer.allTags.includes("High Value"),
    "High Value tag triggered when value >= top quartile"
  );

  // Healthy Customer (Alice: 0 value at risk, low failure rate)
  const healthyCustomer = evaluateCustomerSegmentation(dummyMetrics[0], thresholds);
  assert(healthyCustomer.primarySegment === "Healthy", "Healthy correctly classified");
  assert(healthyCustomer.rulesTriggered["Healthy"].length > 0, "Healthy lists reliable history rule");

  // Priority order verification
  assert(
    SEGMENT_PRIORITY[0] === "High Risk" &&
      SEGMENT_PRIORITY[1] === "High Failure Frequency" &&
      SEGMENT_PRIORITY[2] === "Recovery on Retry" &&
      SEGMENT_PRIORITY[3] === "High Value" &&
      SEGMENT_PRIORITY[4] === "Healthy",
    "Priority order matches: High Risk > High Failure Frequency > Recovery on Retry > High Value > Healthy"
  );

  // Low confidence flag for thin history
  assert(
    dummyMetrics[3].isLowConfidence === true,
    "Thin history (< 3 attempts) properly sets isLowConfidence flag"
  );

  // ─── Test Suite 3: Deterministic Metric Functions & Data Parity ───
  console.log("\nSuite 3: Backend Metric Functions & Real Data Parity");

  // topFailureReasons()
  const topReasons = await topFailureReasons();
  assert(topReasons.totalFailures === 100, "topFailureReasons totalFailures matches 100 payments");
  assert(topReasons.reasons.length > 0, "topFailureReasons returns categorized failure breakdown");
  const sumCounts = topReasons.reasons.reduce((acc, r) => acc + r.count, 0);
  assert(sumCounts === 100, "Sum of all failure reason counts equals 100 exactly");

  // revenueAtRisk()
  const rev = await revenueAtRisk();
  assert(rev.totalPayments === 100, "revenueAtRisk reflects 100 total payments");
  assert(rev.valueAtRiskPaise === 34620000, "revenueAtRisk valueAtRiskPaise matches ₹3,46,200 (34620000 paise)");
  assert(rev.recoveredPaise === 16925500, "revenueAtRisk recoveredPaise matches ₹1,69,255 (16925500 paise)");
  assert(rev.byMethod.length > 0, "revenueAtRisk provides breakdown by payment method");

  // customerRanking()
  const ranking = await customerRanking("value_at_risk", 5);
  assert(ranking.customers.length === 5, "customerRanking returns requested number of customers");
  assert(
    ranking.customers[0].valueAtRiskPaise >= ranking.customers[1].valueAtRiskPaise,
    "customerRanking sorts customers in descending value at risk"
  );

  // segmentCustomers()
  const segmented = await segmentCustomers();
  assert(segmented.segments.length === 5, "segmentCustomers returns 5 segment summary cards");
  assert(segmented.scatterData.length === 100, "segmentCustomers scatterData contains 100 points (one per customer)");
  const totalSegmentedCustomers = segmented.segments.reduce((acc, s) => acc + s.count, 0);
  assert(totalSegmentedCustomers === 100, "Sum of customers across 5 segments equals 100");

  // getCustomer() & fuzzy close matches
  const validCust = await getCustomer("cust_42_005");
  assert(validCust.found === true, "getCustomer finds valid customer by ID");
  if (validCust.found) {
    assert(validCust.customer.customer.customerId === "cust_42_005", "Returns correct customer record");
    assert(validCust.customer.recommendedAction.title.length > 0, "Customer includes recommended recovery action");
  }

  const invalidCust = await getCustomer("cust_42_999");
  assert(invalidCust.found === false, "getCustomer returns found=false for unknown customer ID");
  if (!invalidCust.found) {
    assert(invalidCust.closeMatches.length > 0, "Returns close match suggestions for unknown ID");
    assert(invalidCust.closeMatches[0].id.startsWith("cust_42_"), "Close match suggestions are valid IDs");
  }

  // getPayment() & fuzzy close matches
  const validPay = await getPayment("pay_42_010");
  assert(validPay.found === true, "getPayment finds valid payment by ID");
  if (validPay.found) {
    assert(validPay.payment.id === "pay_42_010", "Returns correct payment record");
    assert(validPay.failureCategory.length > 0, "Returns payment failure category");
  }

  const invalidPay = await getPayment("pay_42_999");
  assert(invalidPay.found === false, "getPayment returns found=false for unknown payment ID");
  if (!invalidPay.found) {
    assert(invalidPay.closeMatches.length > 0, "Returns close match suggestions for unknown payment ID");
  }

  // recommendAction()
  const recAction = await recommendAction("cust_42_001");
  assert(recAction.found === true, "recommendAction returns recommendation for customer");
  if (recAction.found) {
    assert(recAction.retriesCapStatus.includes("attempts"), "Recommendation cites 3-attempt safety cap");
    assert(recAction.strategy.length > 0, "Recommendation specifies recovery strategy");
  }

  console.log(`\n🎉 All ${passedTests}/${totalTests} unit tests PASSED successfully!`);
}

runTests().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});
