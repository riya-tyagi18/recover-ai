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

  // ─── Test Suite 4: Local NLP, Entity Resolution, Intent & No-Key RAG ───
  console.log("\nSuite 4: Local NLP, Intent Classification & Free Text No-Key RAG");

  const { extractCustomerId, extractPaymentId, resolveCustomerByName, analyzeNlpQuery } =
    await import("../lib/analyst/nlp");
  const { processAnalystQuery } = await import("../lib/analyst/llm");

  // 1. ID normalization variants
  assert(extractCustomerId("cust_42_005") === "cust_42_005", "extractCustomerId: standard ID");
  assert(extractCustomerId("CUST-42-005") === "cust_42_005", "extractCustomerId: uppercase with hyphen");
  assert(extractCustomerId("cust 42 005") === "cust_42_005", "extractCustomerId: with spaces");
  assert(extractPaymentId("pay_42_010") === "pay_42_010", "extractPaymentId: standard ID");
  assert(extractPaymentId("PAY-42-010") === "pay_42_010", "extractPaymentId: uppercase with hyphen");

  // 2. Customer Name matching
  const exactNameRes = await resolveCustomerByName("Riya Mehta");
  assert(exactNameRes.matchedCustomer?.id === "cust_42_080", "resolveCustomerByName: exact full name 'Riya Mehta'");

  const fuzzyNameRes = await resolveCustomerByName("Ria Mehta");
  assert(fuzzyNameRes.matchedCustomer?.id === "cust_42_080", "resolveCustomerByName: typo fuzzy match 'Ria Mehta'");

  const ambiguousNameRes = await resolveCustomerByName("Mehta");
  assert(ambiguousNameRes.isAmbiguous === true, "resolveCustomerByName: 'Mehta' detects ambiguous multiple matches");
  assert(
    (ambiguousNameRes.ambiguousCandidates?.length || 0) > 1,
    "resolveCustomerByName: lists candidate customers for ambiguous query"
  );

  const unknownNameRes = await resolveCustomerByName("Unknown Person XYZ");
  assert(!unknownNameRes.matchedCustomer, "resolveCustomerByName: unknown name returns no match");
  assert((unknownNameRes.closeMatches?.length || 0) > 0, "resolveCustomerByName: suggests closest matches");

  // 3. Intent Classification
  const intent1 = await analyzeNlpQuery("which failure reason is most common?");
  assert(intent1.intent === "top_failure_reasons", "analyzeNlpQuery: 'which failure reason is most common?' classified correctly");

  const intent2 = await analyzeNlpQuery("revenue at risk");
  assert(intent2.intent === "revenue_at_risk", "analyzeNlpQuery: 'revenue at risk' classified correctly");

  const intent3 = await analyzeNlpQuery("customers with highest failure rates");
  assert(intent3.intent === "highest_failure_rate_customers", "analyzeNlpQuery: 'highest failure rates' classified correctly");

  const intent4 = await analyzeNlpQuery("why did payment pay_42_010 fail?");
  assert(intent4.intent === "payment_reason", "analyzeNlpQuery: 'why did payment fail?' classified correctly");
  assert(intent4.entities.paymentId === "pay_42_010", "analyzeNlpQuery: extracted paymentId pay_42_010");

  const intent5 = await analyzeNlpQuery("tell me about riya mehta");
  assert(intent5.intent === "customer_profile", "analyzeNlpQuery: 'tell me about riya mehta' classified correctly");
  assert(intent5.entities.customerId === "cust_42_080", "analyzeNlpQuery: resolved customerId cust_42_080 for Riya Mehta");

  // Entity-only query shortcut
  const intentEntityOnly = await analyzeNlpQuery("cust_42_005");
  assert(intentEntityOnly.intent === "customer_profile", "analyzeNlpQuery: entity-only 'cust_42_005' -> customer_profile");
  assert(intentEntityOnly.entities.customerId === "cust_42_005", "analyzeNlpQuery: extracted customerId cust_42_005");

  // 4. Session Context Follow-ups
  const context = { lastCustomerId: "cust_42_080", lastCustomerName: "Riya Mehta" };
  const followUp1 = await analyzeNlpQuery("what is their risk segment?", context);
  assert(followUp1.intent === "risk_segment", "Follow-up: 'what is their risk segment?' classified as risk_segment");
  assert(followUp1.entities.customerId === "cust_42_080", "Follow-up: inherited lastCustomerId cust_42_080");

  const followUp2 = await analyzeNlpQuery("what action do you recommend for them?", context);
  assert(followUp2.intent === "recovery_recommendation", "Follow-up: 'what action do you recommend' classified correctly");
  assert(followUp2.entities.customerId === "cust_42_080", "Follow-up: inherited lastCustomerId cust_42_080");

  // 5. Free-Text No-Key RAG Execution
  console.log("\nExecuting free-text queries in data-only mode (NO LLM KEY):");

  // "tell me about riya mehta"
  const q1 = await processAnalystQuery("tell me about riya mehta");
  assert(!q1.text.includes("AI chat not configured"), "q1: Does NOT return 'AI chat not configured'");
  assert(q1.text.includes("Riya Mehta"), "q1: Answers with Riya Mehta's profile");
  assert(q1.text.includes("cust_42_080"), "q1: Cites correct customer ID cust_42_080");
  assert(q1.isDataOnlyMode === true, "q1: Runs cleanly in data-only mode");
  assert(q1.toolData?.found === true, "q1: Attaches toolData for rich UI rendering");

  // "tell me about cust_42_005"
  const q2 = await processAnalystQuery("tell me about cust_42_005");
  assert(!q2.text.includes("AI chat not configured"), "q2: Does NOT return 'AI chat not configured'");
  assert(q2.text.includes("cust_42_005"), "q2: Cites cust_42_005");
  assert(q2.text.includes("Anjali Sharma"), "q2: Answers with customer Anjali Sharma");
  assert(q2.text.includes("Rules Fired") || q2.text.includes("Segment"), "q2: Cites segment rules");

  // "what is their risk segment?" (with session context)
  const q3 = await processAnalystQuery("what is their risk segment?", {
    lastCustomerId: "cust_42_005",
    lastCustomerName: "Anjali Sharma",
  });
  assert(!q3.text.includes("AI chat not configured"), "q3: Does NOT return 'AI chat not configured'");
  assert(q3.text.includes("Anjali Sharma"), "q3: Resolves follow-up customer name from session context");
  assert(q3.text.includes("classified as"), "q3: Answers with risk segment");

  // "which failure reason is most common?"
  const q4 = await processAnalystQuery("which failure reason is most common?");
  assert(!q4.text.includes("AI chat not configured"), "q4: Does NOT return 'AI chat not configured'");
  assert(q4.text.includes("most frequent payment failure reason"), "q4: Identifies top failure reason");
  assert(q4.text.includes("Insufficient funds"), "q4: Matches dataset's top failure reason");
  assert(q4.toolData?.reasons?.length > 0, "q4: Includes failure reasons breakdown in payload");

  // "revenue at risk"
  const q5 = await processAnalystQuery("how much revenue is at risk?");
  assert(!q5.text.includes("AI chat not configured"), "q5: Does NOT return 'AI chat not configured'");
  assert(q5.text.includes("₹3,46,200"), "q5: Accurately quotes dataset value at risk (₹3,46,200)");
  assert(q5.text.includes("₹1,69,255"), "q5: Accurately quotes dataset recovered revenue (₹1,69,255)");

  console.log(`\n🎉 All ${passedTests}/${totalTests} unit tests PASSED successfully!`);
}

runTests().catch((err) => {
  console.error("Unhandled test error:", err);
  process.exit(1);
});

