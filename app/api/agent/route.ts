import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/process";

const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Try configured Python agent first; fall back to in-process TS agent
    let data: unknown = null;
    try {
      const response = await fetch(`${AGENT_URL}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        data = await response.json();
      }
    } catch {
      // Python backend unavailable — using in-process agent
    }

    if (!data) {
      data = runAgent(body.payment, body.customer, body.failure);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Agent proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
