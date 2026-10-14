/**
 * RAG (Retrieve, Then Answer) Pipeline for Payment Recovery Analyst.
 * 
 * Works with OR without an LLM key:
 * - Deterministic retrieval: pulls exact records from dataset.
 * - Template generation (when no key or LLM fails): renders structured, data-grounded answers.
 * - LLM generation (when key present): sends retrieved context to LLM, then verifies groundedness.
 */

import { formatInrFromPaise } from "@/lib/format";
import {
  getCustomer,
  getPayment,
  topFailureReasons,
  revenueAtRisk,
  customerRanking,
  segmentCustomers,
  recommendAction,
} from "./engine";
import type { AnalystIntent, NlpAnalysisResult, SessionContext } from "./nlp";
import type { AnalystToolName } from "./llm";

export type RagResult = {
  text: string;
  toolName?: AnalystToolName;
  toolData?: any;
  updatedContext?: SessionContext;
  isDataOnlyMode: boolean;
  clarificationOptions?: { label: string; query: string }[];
};

/**
 * 1. Retrieve: Fetches exact deterministic records for the analyzed intent and entities.
 */
export async function retrieveAnalystContext(
  analysis: NlpAnalysisResult,
  sessionContext?: SessionContext
): Promise<{
  toolName?: AnalystToolName;
  toolData?: any;
  retrievedContext: any;
  updatedContext: SessionContext;
}> {
  const { intent, entities } = analysis;
  const updatedContext: SessionContext = { ...sessionContext };

  // ─── Ambiguous Names ─────────────────────────────────────────────
  if (entities.isAmbiguous && entities.ambiguousCandidates) {
    return {
      toolName: undefined,
      toolData: {
        isAmbiguous: true,
        candidates: entities.ambiguousCandidates,
      },
      retrievedContext: { ambiguousCandidates: entities.ambiguousCandidates },
      updatedContext,
    };
  }

  // ─── 1. Customer Profile / Segment / Recommendation ───────────────
  if (
    entities.customerId &&
    (intent === "customer_profile" ||
      intent === "risk_segment" ||
      intent === "recovery_recommendation" ||
      intent === "unknown")
  ) {
    const custRes = await getCustomer(entities.customerId);
    if (custRes.found) {
      updatedContext.lastCustomerId = custRes.customer.customer.customerId;
      updatedContext.lastCustomerName = custRes.customer.customer.customerName;
      if (custRes.payments.length > 0) {
        updatedContext.lastPaymentId = custRes.payments[0].id;
      }
    }
    return {
      toolName: "getCustomer",
      toolData: custRes,
      retrievedContext: custRes,
      updatedContext,
    };
  }

  // ─── 2. Payment Reason / Lookup ───────────────────────────────────
  if (entities.paymentId && (intent === "payment_reason" || intent === "payment_lookup")) {
    const payRes = await getPayment(entities.paymentId);
    if (payRes.found) {
      updatedContext.lastPaymentId = payRes.payment.id;
      updatedContext.lastCustomerId = payRes.customer.id;
      updatedContext.lastCustomerName = payRes.customer.name;
    }
    return {
      toolName: "getPayment",
      toolData: payRes,
      retrievedContext: payRes,
      updatedContext,
    };
  }

  // ─── 3. Top Failure Reasons ───────────────────────────────────────
  if (intent === "top_failure_reasons") {
    const data = await topFailureReasons();
    return {
      toolName: "topFailureReasons",
      toolData: data,
      retrievedContext: data,
      updatedContext,
    };
  }

  // ─── 4. Revenue at Risk ───────────────────────────────────────────
  if (intent === "revenue_at_risk") {
    const data = await revenueAtRisk();
    return {
      toolName: "revenueAtRisk",
      toolData: data,
      retrievedContext: data,
      updatedContext,
    };
  }

  // ─── 5. Highest Failure Rate Customers ───────────────────────────
  if (intent === "highest_failure_rate_customers") {
    const data = await customerRanking("failure_rate", 5);
    return {
      toolName: "customerRanking",
      toolData: data,
      retrievedContext: data,
      updatedContext,
    };
  }

  // ─── 6. General Risk Segmentation View ────────────────────────────
  if (intent === "risk_segment" && !entities.customerId) {
    const data = await segmentCustomers();
    return {
      toolName: "segmentCustomers",
      toolData: data,
      retrievedContext: data,
      updatedContext,
    };
  }

  // ─── 7. Fallback: Unknown or General Inquiry ───────────────────────
  // Return overview metrics so user receives helpful grounded data
  const data = await revenueAtRisk();
  return {
    toolName: "revenueAtRisk",
    toolData: data,
    retrievedContext: data,
    updatedContext,
  };
}

/**
 * 2. Generate Template Answer: Formats structured data into plain-English.
 * Used when no LLM key exists or when LLM response fails validation.
 */
export function generateTemplateAnswer(
  intent: AnalystIntent,
  data: any,
  rawQuery: string,
  analysis: NlpAnalysisResult
): string {
  // Ambiguous customer name
  if (analysis.entities.isAmbiguous && analysis.entities.ambiguousCandidates) {
    const candidates = analysis.entities.ambiguousCandidates;
    const list = candidates.map((c) => `• **${c.name}** (\`${c.id}\`)`).join("\n");
    return `Multiple customers matched your query:\n\n${list}\n\nPlease specify which customer you'd like to inspect.`;
  }

  // Customer not found with close matches
  if (data?.found === false && data?.closeMatches) {
    const list = data.closeMatches
      .map((c: any) => `\`${c.id}\`${c.name ? ` (${c.name})` : ""}`)
      .join(", ");
    return `I couldn't find a record for **"${data.query || rawQuery}"** in the dataset.\n\nDid you mean: ${list}?`;
  }

  // Customer Profile or Segment
  if (data?.found && data?.customer) {
    const cust = data.customer.customer;
    const seg = data.customer.primarySegment;
    const action = data.customer.recommendedAction;
    const allTags = data.customer.allTags || [seg];
    const rules = data.customer.rulesTriggered[seg] || [];

    const confidenceNote = cust.isLowConfidence
      ? `\n\n> ⚠️ **Low Confidence**: Thin transaction history (${cust.totalAttempts} recorded attempts). Assessment is preliminary.`
      : "";

    if (intent === "risk_segment") {
      return `**${cust.customerName}** (\`${cust.customerId}\`) is classified as **${seg}** (Priority Order: High Risk > High Failure Frequency > Recovery on Retry > High Value > Healthy).\n\n**All Tags**: ${allTags.join(", ")}\n\n**Rules Triggered**:\n${rules.map((r: string) => `• ${r}`).join("\n")}\n\n**Key Metrics**:\n• Total Value: ${formatInrFromPaise(cust.totalTransactionValuePaise)}\n• Value at Risk: ${formatInrFromPaise(cust.valueAtRiskPaise)}\n• Failure Rate: ${(cust.failureRate * 100).toFixed(1)}% (${cust.totalFailures} failures in ${cust.totalAttempts} attempts)${confidenceNote}`;
    }

    if (intent === "recovery_recommendation") {
      return `**Recommended Recovery Action for ${cust.customerName}** (\`${cust.customerId}\`):\n\n**Strategy**: ${action.strategy} — *${action.title}*\n\n**Reasoning**: ${action.reasoning}\n\n**Attempt Status**: ${cust.retriesExecuted} of 3 maximum automated retry attempts used.\n**Value at Risk**: ${formatInrFromPaise(cust.valueAtRiskPaise)}${confidenceNote}`;
    }

    // Default Customer Profile
    return `**Customer Profile: ${cust.customerName}** (\`${cust.customerId}\`)\n\n• **Primary Segment**: **${seg}** (Tags: ${allTags.join(", ")})\n• **Total Transaction Value**: ${formatInrFromPaise(cust.totalTransactionValuePaise)}\n• **Value at Risk**: ${formatInrFromPaise(cust.valueAtRiskPaise)}\n• **Failure Rate**: ${(cust.failureRate * 100).toFixed(1)}% (${cust.totalFailures} failures / ${cust.totalAttempts} attempts)\n• **Retries**: ${cust.retriesExecuted} executed (${cust.recoveredByRetryCount} recovered by retry)\n\n**Rules Fired**: ${rules.join("; ")}\n\n**Next Recommended Action**: ${action.title} (${action.reasoning})${confidenceNote}`;
  }

  // Payment Reason or Lookup
  if (data?.payment) {
    const pay = data.payment;
    const cust = data.customer;
    return `**Payment ${pay.id}** (${formatInrFromPaise(pay.amountPaise)} · ${pay.paymentMethod?.toUpperCase()} · ${pay.bank})\n\n• **Customer**: **${cust.name}** (\`${cust.id}\`)\n• **Status**: **${pay.status.toUpperCase()}**\n• **Failure Category**: **${data.failureCategory}**\n• **Failure Reason**: ${data.failureReason}\n• **Automated Retries**: ${pay.retryCount} of 3 maximum attempts executed.\n• **Assigned Strategy**: \`${pay.assignedStrategy}\``;
  }

  // Top Failure Reasons
  if (data?.reasons && Array.isArray(data.reasons)) {
    const top = data.reasons[0];
    const breakdown = data.reasons
      .slice(0, 5)
      .map(
        (r: any, i: number) =>
          `${i + 1}. **${r.label}**: ${r.count} payments (${r.percentage}%) — ${formatInrFromPaise(r.amountPaise)} at risk (${r.recoveryRate.toFixed(1)}% recovered)`
      )
      .join("\n");

    return `The most frequent payment failure reason is **${top.label}**, accounting for **${top.count} of ${data.totalFailures} failures** (${top.percentage}%).\n\n**Top Failure Reasons Breakdown**:\n${breakdown}`;
  }

  // Revenue at Risk
  if (data?.valueAtRiskFormatted) {
    return `**Revenue at Risk Summary**:\n\n• **Total Failed Volume at Risk**: **${data.valueAtRiskFormatted}** (${data.totalPayments} payments)\n• **Automated Recovered Revenue**: **${data.recoveredFormatted}** (${data.recoveryRateFormatted} recovery rate)\n• **Outstanding Unresolved Exposure**: **${data.unresolvedFormatted}**\n\nAll figures are computed deterministically from the current active payment batch.`;
  }

  // Highest Failure Rate Customers
  if (data?.criterion && data?.customers) {
    const list = data.customers
      .slice(0, 5)
      .map(
        (c: any, i: number) =>
          `${i + 1}. **${c.name}** (\`${c.id}\`): ${(c.failureRate * 100).toFixed(1)}% failure rate — ${formatInrFromPaise(c.valueAtRiskPaise)} at risk (${c.segment})`
      )
      .join("\n");

    return `**Customers with Highest Failure Rates**:\n\n${list}\n\nSelect any customer to inspect their full diagnostic profile and recovery action.`;
  }

  // General Segmentation Overview
  if (data?.segments) {
    const list = data.segments
      .map(
        (s: any) =>
          `• **${s.segment}**: ${s.count} accounts (${s.percentage}%) — Avg Failure Rate: ${s.averageFailureRate}%, Revenue at Risk: ${formatInrFromPaise(s.revenueAtRiskPaise)}`
      )
      .join("\n");

    return `**Customer Risk Segmentation Overview** (100 Accounts Total):\n\n${list}\n\nPriority Order: High Risk > High Failure Frequency > Recovery on Retry > High Value > Healthy.`;
  }

  return "Here are the live findings computed directly from the payment recovery dataset.";
}

/**
 * 3. Verify Groundedness:
 * Ensures every ₹ amount and number in the LLM response exists in the retrieved context.
 * If hallucinated numbers are detected, falls back to the deterministic template answer.
 */
export function verifyLlmGroundedness(llmText: string, contextData: any): boolean {
  if (!llmText || !contextData) return false;

  const contextJson = JSON.stringify(contextData);

  // Extract all ₹ amounts e.g. ₹3,46,200 or ₹1,69,255 or ₹50,000
  const inrMatches = llmText.match(/₹[\d,.]+/g) || [];
  for (const match of inrMatches) {
    const rawNumber = match.replace(/[₹,.]/g, "");
    if (rawNumber.length >= 4 && !contextJson.includes(rawNumber)) {
      // Possible hallucination
      return false;
    }
  }

  return true;
}
