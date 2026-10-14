import { NextResponse } from "next/server";
import { z } from "zod";
import { processAnalystQuery, executeDeterministicTool, type AnalystToolName } from "@/lib/analyst/llm";
import { getCustomer } from "@/lib/analyst/engine";

// ─── In-Memory Rate Limiting ──────────────────────────────────────────
// 30 requests per minute per IP / client
type RateLimitRecord = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 40;

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(clientId);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - record.count };
}

// ─── Input Validation Schema ──────────────────────────────────────────
const RequestSchema = z.object({
  message: z.string().optional(),
  action: z
    .enum([
      "customer_risk",
      "top_failures",
      "revenue_at_risk",
      "recommendations",
      "customer_detail",
    ])
    .optional(),
  customerId: z.string().optional(),
  paymentId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Auth verification (behind existing auth)
    const authHeader = request.headers.get("x-rai-auth") || request.headers.get("authorization");
    const cookieHeader = request.headers.get("cookie") || "";
    const isClientAuthed =
      authHeader === "1" ||
      cookieHeader.includes("raiAuth=1") ||
      request.headers.get("referer")?.includes("/analyst");

    if (!isClientAuthed) {
      return NextResponse.json({ error: "Unauthorized access. Please log in." }, { status: 401 });
    }

    // 2. Rate limiting
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous-client";

    const { allowed, remaining } = checkRateLimit(clientIp);
    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a minute before sending more queries." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    // 3. Parse and validate body
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { message, action, customerId } = parsed.data;

    // ─── Direct Suggestion Button Handling (Direct deterministic execution) ───
    if (action) {
      let toolName: AnalystToolName;
      let toolData: unknown;
      let title = "";

      switch (action) {
        case "customer_risk":
          toolName = "segmentCustomers";
          toolData = await executeDeterministicTool("segmentCustomers", {});
          title = "Customer Risk Segmentation Analysis";
          break;
        case "top_failures":
          toolName = "topFailureReasons";
          toolData = await executeDeterministicTool("topFailureReasons", {});
          title = "Top Payment Failure Reasons";
          break;
        case "revenue_at_risk":
          toolName = "revenueAtRisk";
          toolData = await executeDeterministicTool("revenueAtRisk", {});
          title = "Revenue at Risk & Recovery Overview";
          break;
        case "recommendations":
          toolName = "customerRanking";
          toolData = await executeDeterministicTool("customerRanking", { criterion: "value_at_risk" });
          title = "Priority Recovery Recommendations";
          break;
        case "customer_detail":
          if (!customerId) {
            return NextResponse.json({ error: "Missing customerId parameter" }, { status: 400 });
          }
          toolName = "getCustomer";
          toolData = await getCustomer(customerId);
          title = `Customer Analysis: ${customerId}`;
          break;
        default:
          return NextResponse.json({ error: "Unknown action" }, { status: 400 });
      }

      return NextResponse.json({
        isConfigured: true,
        text: `Here is the current ${title} computed from the live dataset:`,
        toolName,
        toolData,
      });
    }

    // ─── Free-Text Message Handling (via LLM with tool calling) ─────────
    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
    }

    const response = await processAnalystQuery(message);
    return NextResponse.json(response);
  } catch (error) {
    console.error("Analyst API error:", error);
    return NextResponse.json(
      { error: "Internal server error in Payment Recovery Analyst." },
      { status: 500 }
    );
  }
}
