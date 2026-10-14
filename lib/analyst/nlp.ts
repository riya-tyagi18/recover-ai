/**
 * Local NLP Layer for Payment Recovery Analyst.
 * 
 * Works 100% locally with zero external API calls or LLM dependencies:
 * 1. Entity Resolution: Customer IDs, Payment IDs, and Customer Names (exact, ambiguous, fuzzy).
 * 2. Intent Classification: Keyword and regex pattern scoring over existing recovery intents.
 * 3. Session Context / Follow-ups: Resolves pronouns ("their", "it", "this customer") from session memory.
 */

import { readStore } from "@/lib/db/store";
import { findCloseMatches } from "./engine";

export type ResolvedEntities = {
  customerId?: string;
  customerName?: string;
  paymentId?: string;
  isAmbiguous?: boolean;
  ambiguousCandidates?: { id: string; name: string }[];
  unknownTarget?: string;
  closeMatches?: { id: string; name?: string }[];
};

export type AnalystIntent =
  | "customer_profile"
  | "risk_segment"
  | "payment_reason"
  | "top_failure_reasons"
  | "revenue_at_risk"
  | "highest_failure_rate_customers"
  | "recovery_recommendation"
  | "payment_lookup"
  | "unknown";

export type SessionContext = {
  lastCustomerId?: string;
  lastCustomerName?: string;
  lastPaymentId?: string;
};

export type NlpAnalysisResult = {
  intent: AnalystIntent;
  confidence: number; // 0.0 to 1.0
  entities: ResolvedEntities;
  isFollowUp: boolean;
  clarificationNeeded?: boolean;
  clarificationOptions?: { label: string; query: string }[];
};

// ─── 1. Customer & Payment ID Normalization ───────────────────────────

/**
 * Normalizes customer ID variants:
 * cust_42_005, CUST-42-005, cust 42 005, CUST_42_005 -> cust_42_005
 */
export function extractCustomerId(text: string): string | null {
  // Matches cust_42_005, cust-42-005, cust 42 005, customer 42 005, etc.
  const regex = /\b(?:cust|customer)[_\s-]*(\d+)[_\s-]*(\d+)\b/i;
  const match = text.match(regex);
  if (match) {
    const seed = match[1];
    const index = match[2].padStart(3, "0");
    return `cust_${seed}_${index}`;
  }

  // General cust_xxx pattern
  const generalRegex = /\b(cust_[a-zA-Z0-9_-]+)\b/i;
  const generalMatch = text.match(generalRegex);
  if (generalMatch) {
    return generalMatch[1].toLowerCase().replace(/-/g, "_");
  }

  return null;
}

/**
 * Normalizes payment ID variants:
 * pay_42_010, PAY-42-010, pay 42 010, PAY_42_010 -> pay_42_010
 */
export function extractPaymentId(text: string): string | null {
  const regex = /\b(?:pay|payment)[_\s-]*(\d+)[_\s-]*(\d+)\b/i;
  const match = text.match(regex);
  if (match) {
    const seed = match[1];
    const index = match[2].padStart(3, "0");
    return `pay_${seed}_${index}`;
  }

  const generalRegex = /\b(pay_[a-zA-Z0-9_-]+)\b/i;
  const generalMatch = text.match(generalRegex);
  if (generalMatch) {
    return generalMatch[1].toLowerCase().replace(/-/g, "_");
  }

  return null;
}

// ─── 2. Customer Name Matching ────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches customer names from the dataset. Handles:
 * - Exact full name
 * - Case-insensitive match
 * - Ambiguous multiple matches (e.g. searching "Mehta")
 * - Fuzzy match (typos e.g. "Ria Mehta" -> "Riya Mehta")
 */
export async function resolveCustomerByName(
  rawQuery: string
): Promise<{
  matchedCustomer?: { id: string; name: string };
  isAmbiguous?: boolean;
  ambiguousCandidates?: { id: string; name: string }[];
  closeMatches?: { id: string; name?: string }[];
}> {
  const store = await readStore();
  const queryClean = cleanText(rawQuery);

  if (!queryClean || queryClean.length < 2) return {};

  // Strip common filler words
  const stopWords = new Set([
    "tell", "me", "about", "what", "is", "the", "who", "which", "customer",
    "details", "profile", "account", "status", "show", "give", "lookup",
    "search", "find", "and", "for", "risk", "segment", "their", "of", "please"
  ]);

  const queryWords = queryClean
    .split(" ")
    .filter((w) => !stopWords.has(w) && w.length > 1);

  if (queryWords.length === 0) return {};

  const nameQuery = queryWords.join(" ");

  // 1. Exact full name match
  const exact = store.customers.find(
    (c) => c.name.toLowerCase() === nameQuery.toLowerCase()
  );
  if (exact) {
    return { matchedCustomer: { id: exact.id, name: exact.name } };
  }

  // 2. Full name substring match (e.g. query contains "riya mehta")
  const fullSubstrings = store.customers.filter((c) =>
    queryClean.includes(c.name.toLowerCase())
  );
  if (fullSubstrings.length === 1) {
    return { matchedCustomer: { id: fullSubstrings[0].id, name: fullSubstrings[0].name } };
  }
  if (fullSubstrings.length > 1) {
    return {
      isAmbiguous: true,
      ambiguousCandidates: fullSubstrings.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  // 3. Exact word-sequence match (both first and last name present)
  if (queryWords.length >= 2) {
    const bothWords = store.customers.filter((c) => {
      const cLower = c.name.toLowerCase();
      return queryWords.every((w) => cLower.includes(w));
    });
    if (bothWords.length === 1) {
      return { matchedCustomer: { id: bothWords[0].id, name: bothWords[0].name } };
    }
    if (bothWords.length > 1) {
      return {
        isAmbiguous: true,
        ambiguousCandidates: bothWords.map((c) => ({ id: c.id, name: c.name })),
      };
    }
  }

  // 4. Single-token matches (e.g. user typed "Mehta" or "Anjali")
  if (queryWords.length === 1) {
    const singleToken = queryWords[0];
    const tokenMatches = store.customers.filter((c) => {
      const parts = c.name.toLowerCase().split(" ");
      return parts.includes(singleToken);
    });

    if (tokenMatches.length === 1) {
      return { matchedCustomer: { id: tokenMatches[0].id, name: tokenMatches[0].name } };
    }
    if (tokenMatches.length > 1) {
      return {
        isAmbiguous: true,
        ambiguousCandidates: tokenMatches.map((c) => ({ id: c.id, name: c.name })),
      };
    }
  }

  // 5. Fuzzy match for typos (e.g. "Ria Mehta" -> "Riya Mehta", "Anjali Shrma")
  const candidates = store.customers.map((c) => ({ id: c.id, name: c.name }));
  const close = findCloseMatches(nameQuery, candidates, 3);

  // If the top close match has a high similarity (distance <= 2)
  if (close.length > 0 && close[0].name) {
    const top = close[0];
    const topName = top.name;
    if (topName) {
      const dist = levenshtein(nameQuery, topName.toLowerCase());
      if (dist <= 2) {
        return { matchedCustomer: { id: top.id, name: topName } };
      }
    }
  }

  return { closeMatches: close };
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── 3. Intent Classification (Pattern & Keyword Scoring) ─────────────

type IntentRule = {
  intent: AnalystIntent;
  patterns: RegExp[];
  keywords: string[];
  weight: number;
};

const INTENT_RULES: IntentRule[] = [
  {
    intent: "top_failure_reasons",
    patterns: [
      /why (?:are|do) payments fail/i,
      /which failure (?:reason|type|code) is (?:most|top)/i,
      /top failure/i,
      /common failure/i,
      /failure breakdown/i,
      /failure distribution/i,
      /most frequent failure/i,
      /reasons? for failure/i,
    ],
    keywords: ["failure", "reasons", "common", "frequent", "breakdown", "codes", "top"],
    weight: 1.5,
  },
  {
    intent: "revenue_at_risk",
    patterns: [
      /revenue at risk/i,
      /value at risk/i,
      /how much (?:revenue|money|paise|amount) is at risk/i,
      /how much (?:was|is) recovered/i,
      /recovery rate/i,
      /financial summary/i,
      /total at risk/i,
      /unresolved/i,
    ],
    keywords: ["revenue", "risk", "value", "recovered", "unresolved", "rate", "paise"],
    weight: 1.5,
  },
  {
    intent: "highest_failure_rate_customers",
    patterns: [
      /highest failure rate/i,
      /worst failure/i,
      /customers? with (?:the )?(?:highest|most) failures/i,
      /who fails (?:the )?most/i,
      /top failing (?:accounts|customers)/i,
      /rank customers/i,
    ],
    keywords: ["highest", "worst", "rate", "customers", "failing", "rank"],
    weight: 1.4,
  },
  {
    intent: "risk_segment",
    patterns: [
      /(?:what|which|show|find|view|check|their)?.*(?:risk\s+)?segment/i,
      /\bsegment(?:s|ation)?\b/i,
      /risk (?:classification|category|tier|score)/i,
      /is (?:this|the|they) (?:customer )?high risk/i,
      /customer segment/i,
      /all segments/i,
    ],
    keywords: ["segment", "segmentation", "classification", "category", "healthy", "tier"],
    weight: 1.6,
  },
  {
    intent: "recovery_recommendation",
    patterns: [
      /(?:what|which) action (?:do you|should we) recommend/i,
      /recovery recommendation/i,
      /recommended action/i,
      /what should (?:we|i) do/i,
      /next step/i,
      /suggested strategy/i,
      /how to recover/i,
    ],
    keywords: ["recommend", "recommendation", "action", "strategy", "next", "suggest", "steps"],
    weight: 1.4,
  },
  {
    intent: "payment_reason",
    patterns: [
      /why did (?:payment |it )?fail/i,
      /reason (?:this|the|for) payment failed/i,
      /payment failure reason/i,
      /cause of failure/i,
    ],
    keywords: ["payment", "why", "failed", "failure", "cause", "reason"],
    weight: 1.3,
  },
  {
    intent: "customer_profile",
    patterns: [
      /tell me about/i,
      /who is/i,
      /customer profile/i,
      /account diagnostic/i,
      /customer details/i,
      /lookup customer/i,
    ],
    keywords: ["tell", "about", "customer", "profile", "account", "details", "info"],
    weight: 1.2,
  },
  {
    intent: "payment_lookup",
    patterns: [
      /tell me about payment/i,
      /payment details/i,
      /lookup payment/i,
      /payment audit/i,
    ],
    keywords: ["payment", "pay", "details", "audit", "lookup"],
    weight: 1.2,
  },
];

export async function analyzeNlpQuery(
  rawQuery: string,
  sessionContext?: SessionContext
): Promise<NlpAnalysisResult> {
  const query = rawQuery.trim();
  const lowerQuery = query.toLowerCase();

  // ─── 1. Extract Explicit IDs ──────────────────────────────────────
  let custId = extractCustomerId(query);
  let payId = extractPaymentId(query);

  let custName: string | undefined;
  let isAmbiguous = false;
  let ambiguousCandidates: { id: string; name: string }[] | undefined;
  let closeMatches: { id: string; name?: string }[] | undefined;

  // ─── 2. Resolve Customer by Name if ID not found ──────────────────
  if (!custId && !payId) {
    const nameRes = await resolveCustomerByName(query);
    if (nameRes.matchedCustomer) {
      custId = nameRes.matchedCustomer.id;
      custName = nameRes.matchedCustomer.name;
    } else if (nameRes.isAmbiguous) {
      isAmbiguous = true;
      ambiguousCandidates = nameRes.ambiguousCandidates;
    } else if (nameRes.closeMatches && nameRes.closeMatches.length > 0) {
      closeMatches = nameRes.closeMatches;
    }
  }

  // ─── 3. Follow-up Resolution via Session Context ──────────────────
  let isFollowUp = false;
  const isFollowUpPattern =
    /\b(?:they|their|them|this customer|it|the customer|this payment|the payment)\b/i.test(
      query
    );

  if (!custId && (isFollowUpPattern || !custName)) {
    if (sessionContext?.lastCustomerId) {
      custId = sessionContext.lastCustomerId;
      custName = sessionContext.lastCustomerName;
      isFollowUp = true;
    }
  }

  if (!payId && isFollowUpPattern) {
    if (sessionContext?.lastPaymentId) {
      payId = sessionContext.lastPaymentId;
      isFollowUp = true;
    }
  }

  // ─── 4. Entity-Only Query Shortcut ────────────────────────────────
  // e.g. user simply typed "riya mehta" or "cust_42_005"
  const cleanWords = cleanText(query).split(" ");
  if (cleanWords.length <= 3 && (custId || custName)) {
    const hasIntentKeyword = INTENT_RULES.some((r) =>
      r.patterns.some((p) => p.test(query))
    );
    if (!hasIntentKeyword) {
      return {
        intent: "customer_profile",
        confidence: 0.95,
        entities: { customerId: custId ?? undefined, customerName: custName ?? undefined },
        isFollowUp,
      };
    }
  }

  // ─── 5. Ambiguous Name Early Return ───────────────────────────────
  if (isAmbiguous && ambiguousCandidates) {
    return {
      intent: "customer_profile",
      confidence: 0.5,
      entities: {
        isAmbiguous: true,
        ambiguousCandidates,
      },
      isFollowUp,
      clarificationNeeded: true,
      clarificationOptions: ambiguousCandidates.map((c) => ({
        label: `${c.name} (${c.id})`,
        query: `Tell me about ${c.name} ${c.id}`,
      })),
    };
  }

  // ─── 6. Intent Scoring ───────────────────────────────────────────
  let bestIntent: AnalystIntent = "unknown";
  let highestScore = 0;

  for (const rule of INTENT_RULES) {
    let score = 0;

    // Pattern matches give large weight
    for (const pattern of rule.patterns) {
      if (pattern.test(query)) {
        score += 3.0 * rule.weight;
      }
    }

    // Keyword hits
    for (const kw of rule.keywords) {
      if (lowerQuery.includes(kw)) {
        score += 0.8 * rule.weight;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestIntent = rule.intent;
    }
  }

  // Entity overrides when intent is general
  if (payId && (bestIntent === "unknown" || bestIntent === "customer_profile")) {
    bestIntent = lowerQuery.includes("why") || lowerQuery.includes("fail")
      ? "payment_reason"
      : "payment_lookup";
    highestScore = Math.max(highestScore, 2.5);
  }

  if (custId && bestIntent === "unknown") {
    bestIntent = "customer_profile";
    highestScore = Math.max(highestScore, 2.0);
  }

  // If query is about segments in general
  if (bestIntent === "risk_segment" && !custId) {
    // General risk segmentation view
    bestIntent = "risk_segment";
  }

  const confidence = Math.min(1.0, highestScore / 3.5);

  // ─── 7. Low Confidence / Clarification Handling ──────────────────
  if (confidence < 0.35 && !custId && !payId) {
    return {
      intent: "unknown",
      confidence,
      entities: { closeMatches },
      isFollowUp,
      clarificationNeeded: true,
      clarificationOptions: [
        { label: "View Customer Risk Segmentation", query: "Customer Risk Analysis" },
        { label: "Show Top Payment Failure Reasons", query: "Top Failure Reasons" },
        { label: "Check Total Revenue at Risk", query: "Revenue at Risk" },
        { label: "View Priority Recovery Recommendations", query: "Recovery Recommendations" },
      ],
    };
  }

  return {
    intent: bestIntent,
    confidence,
    entities: {
      customerId: custId ?? undefined,
      customerName: custName ?? undefined,
      paymentId: payId ?? undefined,
      closeMatches,
    },
    isFollowUp,
  };
}
