/**
 * Server-side LLM & Local RAG Orchestration Layer.
 * 
 * Works with OR without an external LLM key:
 * 1. Analyzes user queries locally with Entity Resolution & Intent Classification (no API required).
 * 2. Retrieves deterministic records from the dataset.
 * 3. If an LLM key exists (GROQ_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY):
 *    Sends question + ONLY retrieved context with a 10s timeout, then verifies groundedness.
 * 4. If no LLM key exists (or call fails/times out):
 *    Instantly generates clean, data-grounded answers using deterministic templates.
 *    No "not configured" dead ends!
 */

import { analyzeNlpQuery, type SessionContext } from "./nlp";
import {
  retrieveAnalystContext,
  generateTemplateAnswer,
  verifyLlmGroundedness,
} from "./rag";
export type AnalystToolName =
  | "getCustomer"
  | "getPayment"
  | "topFailureReasons"
  | "revenueAtRisk"
  | "customerRanking"
  | "segmentCustomers"
  | "recommendAction"
  | "unanswerable";

export type AnalystResponse = {
  isConfigured: boolean;
  isDataOnlyMode: boolean;
  text: string;
  toolName?: AnalystToolName;
  toolData?: any;
  updatedContext?: SessionContext;
  clarificationOptions?: { label: string; query: string }[];
  error?: string;
};

const RAG_SYSTEM_PROMPT = `You are the Payment Recovery Analyst for Recover AI.
Your answers MUST be strictly based on the provided dataset context.
RULES:
1. Quote numbers, counts, and ₹ amounts EXACTLY as they appear in the context.
2. If information is not in the provided context, state that it is "not in the data". Never guess.
3. Describe patterns only; never claim causation.
4. Keep answers concise, factual, and actionable.`;

export async function processAnalystQuery(
  userMessage: string,
  sessionContext?: SessionContext
): Promise<AnalystResponse> {
  const query = userMessage.trim();

  // Guard: empty query
  if (!query) {
    return {
      isConfigured: false,
      isDataOnlyMode: true,
      text: "Please enter a question or select one of the suggested actions below.",
    };
  }

  // Guard: very long query (> 1000 chars)
  if (query.length > 1000) {
    return {
      isConfigured: false,
      isDataOnlyMode: true,
      text: "Your message is too long (limit: 1000 characters). Please enter a more focused question.",
    };
  }

  // ─── Step 1: Local NLP Analysis (Entities, Intent, Follow-ups) ───
  const analysis = await analyzeNlpQuery(query, sessionContext);

  // ─── Step 2: Deterministic Retrieval ─────────────────────────────
  const { toolName, toolData, retrievedContext, updatedContext } =
    await retrieveAnalystContext(analysis, sessionContext);

  // Fallback template answer (always computed as guaranteed ground truth)
  const templateAnswer = generateTemplateAnswer(
    analysis.intent,
    retrievedContext,
    query,
    analysis
  );

  // Check for LLM keys (Groq, OpenAI, or Gemini)
  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const hasKey = Boolean(groqKey || openaiKey || geminiKey);

  // ─── Step 3: No Key Path (Instant Data-Only Mode) ─────────────────
  if (!hasKey || analysis.entities.isAmbiguous) {
    return {
      isConfigured: false,
      isDataOnlyMode: true,
      text: templateAnswer,
      toolName,
      toolData,
      updatedContext,
      clarificationOptions: analysis.clarificationOptions,
    };
  }

  // ─── Step 4: LLM Key Present — RAG Synthesis with Verification ────
  try {
    let llmReply = "";

    if (groqKey) {
      llmReply = await callOpenAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        groqKey,
        "llama-3.1-8b-instant",
        query,
        retrievedContext
      );
    } else if (openaiKey) {
      llmReply = await callOpenAiCompatible(
        "https://api.openai.com/v1/chat/completions",
        openaiKey,
        "gpt-4o-mini",
        query,
        retrievedContext
      );
    } else if (geminiKey) {
      llmReply = await callGemini(geminiKey, query, retrievedContext);
    }

    // Verify groundedness (prevent hallucinations of ungrounded ₹ amounts)
    const isGrounded = verifyLlmGroundedness(llmReply, retrievedContext);
    const finalText = isGrounded && llmReply.trim() ? llmReply : templateAnswer;

    return {
      isConfigured: true,
      isDataOnlyMode: false,
      text: finalText,
      toolName,
      toolData,
      updatedContext,
      clarificationOptions: analysis.clarificationOptions,
    };
  } catch (err) {
    console.warn("LLM API call timed out or failed, falling back to data-only template:", err);
    // Graceful fallback to verified template answer on API timeout/error
    return {
      isConfigured: true,
      isDataOnlyMode: true,
      text: templateAnswer,
      toolName,
      toolData,
      updatedContext,
      clarificationOptions: analysis.clarificationOptions,
    };
  }
}

async function callOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  userMessage: string,
  contextData: any
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: RAG_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Question: ${userMessage}\n\nDataset Context (use ONLY this data):\n${JSON.stringify(
            contextData,
            null,
            2
          )}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!res.ok) {
    throw new Error(`LLM endpoint error (${res.status})`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callGemini(apiKey: string, userMessage: string, contextData: any): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const prompt = `${RAG_SYSTEM_PROMPT}\n\nQuestion: ${userMessage}\n\nDataset Context (use ONLY this data):\n${JSON.stringify(
    contextData,
    null,
    2
  )}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 600 },
    }),
    signal: AbortSignal.timeout(10000), // 10s timeout
  });

  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status})`);
  }

  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

export { executeDeterministicTool } from "./engine";
