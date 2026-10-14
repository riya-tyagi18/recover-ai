/**
 * Server-side LLM Orchestration Layer.
 * 
 * Flow:
 * 1. Checks server-side env vars (OPENAI_API_KEY or GEMINI_API_KEY).
 * 2. If missing, returns "AI chat not configured" with the required env var name.
 * 3. If present, calls LLM with strict tool-calling schema (whitelist of 7 deterministic functions only).
 * 4. Runs the chosen backend function deterministically.
 * 5. Sends deterministic data back to LLM for plain-English synthesis.
 * 6. Returns both the text explanation AND the raw deterministic payload for UI rendering.
 */

import {
  getCustomer,
  getPayment,
  topFailureReasons,
  revenueAtRisk,
  customerRanking,
  segmentCustomers,
  recommendAction,
} from "./engine";

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
  text: string;
  toolName?: AnalystToolName;
  toolData?: unknown;
  error?: string;
};

const SYSTEM_PROMPT = `You are the Payment Recovery Analyst for Recover AI, an autonomous fintech revenue recovery agent.

CORE PRINCIPLES:
1. Grounding: All numbers, counts, failure rates, and amounts must strictly come from the deterministic tool output. Never invent, estimate, or hallucinate numbers.
2. Causation: Describe observed patterns in the transaction dataset only; never claim definitive causation.
3. Confidence: If a customer has fewer than 3 payment attempts, clearly flag your assessment as "low confidence" or preliminary due to thin transaction history.
4. Transparency: For customer risk segments, always cite the exact deterministic rules that triggered the classification.
5. Unknown entities: If a customer or payment is not found in the dataset, state that clearly and list the close ID suggestions returned by the tool.
6. Scope: If the query is unrelated to payment recovery, failed transactions, customer risk, or the dataset, use the unanswerable tool to explain that you only analyze the payment recovery dataset.`;

const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "getCustomer",
      description: "Look up a customer by ID (e.g. cust_42_001) or name, returning payment history, failure rate, segment, and rules.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID (e.g. cust_42_005) or customer name" },
        },
        required: ["customerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPayment",
      description: "Look up a specific payment by ID (e.g. pay_42_010), returning amount, failure reason, diagnosis, and audit logs.",
      parameters: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (e.g. pay_42_001)" },
        },
        required: ["paymentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "topFailureReasons",
      description: "Get the breakdown and ranking of payment failure reasons across the entire dataset.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "revenueAtRisk",
      description: "Get the overall revenue at risk, recovered revenue, unresolved exposure, and recovery rate.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "customerRanking",
      description: "Rank customers by failure rate, revenue at risk, or recovery potential.",
      parameters: {
        type: "object",
        properties: {
          criterion: {
            type: "string",
            enum: ["failure_rate", "value_at_risk", "recovery_potential"],
            description: "Ranking metric",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "segmentCustomers",
      description: "Run customer risk segmentation across all customers, returning segment distribution, metrics, and scatter plot coordinates.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recommendAction",
      description: "Get the recommended next recovery action for a customer, taking into account the 3-attempt safety cap and recovery strategies.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID (e.g. cust_42_001) or customer name" },
        },
        required: ["customerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unanswerable",
      description: "Call when the user's question cannot be answered from the payment recovery dataset.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why the question cannot be answered from payment recovery data" },
        },
        required: ["reason"],
      },
    },
  },
];

export async function processAnalystQuery(userMessage: string): Promise<AnalystResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openaiKey && !geminiKey) {
    return {
      isConfigured: false,
      text: "AI chat not configured. Set `OPENAI_API_KEY` (or `GEMINI_API_KEY`) in your server environment to enable natural-language conversational queries. The four analytical buttons below operate on direct deterministic calculations and remain fully functional.",
    };
  }

  try {
    if (openaiKey) {
      return await callOpenAI(userMessage, openaiKey);
    } else if (geminiKey) {
      return await callGemini(userMessage, geminiKey);
    }
  } catch (err) {
    console.error("LLM Analyst execution error:", err);
    return {
      isConfigured: true,
      text: "An error occurred while communicating with the AI service. Please try again or use the direct action buttons below.",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }

  return {
    isConfigured: false,
    text: "AI chat not configured. Please set `OPENAI_API_KEY` in your environment.",
  };
}

/**
 * OpenAI tool-calling flow
 */
async function callOpenAI(userMessage: string, apiKey: string): Promise<AnalystResponse> {
  // Step 1: Tool Selection
  const initialRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      tools: TOOLS_SCHEMA,
      tool_choice: "auto",
      temperature: 0.1,
    }),
  });

  if (!initialRes.ok) {
    const errorText = await initialRes.text();
    throw new Error(`OpenAI API error (${initialRes.status}): ${errorText}`);
  }

  const initialJson = await initialRes.json();
  const choice = initialJson.choices?.[0]?.message;

  if (!choice?.tool_calls || choice.tool_calls.length === 0) {
    return {
      isConfigured: true,
      text: choice?.content || "I couldn't identify the relevant payment data for your request.",
    };
  }

  const toolCall = choice.tool_calls[0];
  const functionName = toolCall.function.name as AnalystToolName;
  const args = JSON.parse(toolCall.function.arguments || "{}");

  // Step 2: Execute Deterministic Backend Function
  const toolData = await executeDeterministicTool(functionName, args);

  // Step 3: Synthesis with Grounded Data
  const synthRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
        choice,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(toolData),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!synthRes.ok) {
    throw new Error(`OpenAI synthesis error (${synthRes.status})`);
  }

  const synthJson = await synthRes.json();
  const finalText = synthJson.choices?.[0]?.message?.content || "";

  return {
    isConfigured: true,
    text: finalText,
    toolName: functionName,
    toolData,
  };
}

/**
 * Gemini REST tool-calling flow
 */
async function callGemini(userMessage: string, apiKey: string): Promise<AnalystResponse> {
  // Convert tools schema to Gemini function declarations
  const functionDeclarations = TOOLS_SCHEMA.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Step 1: Function calling call
  const initialRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userMessage }] }],
      tools: [{ functionDeclarations }],
    }),
  });

  if (!initialRes.ok) {
    throw new Error(`Gemini API error (${initialRes.status}): ${await initialRes.text()}`);
  }

  const initialJson = await initialRes.json();
  const candidate = initialJson.candidates?.[0]?.content;
  const functionCallPart = candidate?.parts?.find((p: { functionCall?: { name: string; args: unknown } }) => p.functionCall);

  if (!functionCallPart?.functionCall) {
    const textPart = candidate?.parts?.find((p: { text?: string }) => p.text);
    return {
      isConfigured: true,
      text: textPart?.text || "No payment recovery data found for this request.",
    };
  }

  const functionName = functionCallPart.functionCall.name as AnalystToolName;
  const args = functionCallPart.functionCall.args || {};

  // Step 2: Run deterministic backend function
  const toolData = await executeDeterministicTool(functionName, args);

  // Step 3: Synthesis
  const synthRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        { role: "user", parts: [{ text: userMessage }] },
        candidate,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: functionName,
                response: { data: toolData },
              },
            },
          ],
        },
      ],
    }),
  });

  if (!synthRes.ok) {
    throw new Error(`Gemini synthesis error (${synthRes.status})`);
  }

  const synthJson = await synthRes.json();
  const finalText = synthJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return {
    isConfigured: true,
    text: finalText,
    toolName: functionName,
    toolData,
  };
}

/**
 * Whitelist dispatcher: strictly routes to deterministic functions only.
 */
export async function executeDeterministicTool(name: AnalystToolName, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "getCustomer":
      return await getCustomer(String(args.customerId || ""));
    case "getPayment":
      return await getPayment(String(args.paymentId || ""));
    case "topFailureReasons":
      return await topFailureReasons();
    case "revenueAtRisk":
      return await revenueAtRisk();
    case "customerRanking":
      return await customerRanking((args.criterion as "failure_rate" | "value_at_risk" | "recovery_potential") || "failure_rate");
    case "segmentCustomers":
      return await segmentCustomers();
    case "recommendAction":
      return await recommendAction(String(args.customerId || ""));
    case "unanswerable":
      return {
        unanswerable: true,
        reason: String(args.reason || "Question cannot be answered from the payment recovery dataset."),
      };
    default:
      throw new Error(`Unauthorized tool call: ${name}`);
  }
}
