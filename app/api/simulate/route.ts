import { z } from "zod";
import { createOrReuseBatch } from "@/lib/db/batches";
import { requireOwner, validateCsrf, AuthError } from "@/lib/auth/guard";
import { NextResponse } from "next/server";

const SimulateBody = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  count: z.number().int().min(50).max(100),
});

export async function POST(request: Request) {
  if (!validateCsrf(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  try {
    await requireOwner(request);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SimulateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "seed must be an integer ≥ 0; count must be 50–100." },
      { status: 400 },
    );
  }

  try {
    const result = await createOrReuseBatch(parsed.data.seed, parsed.data.count);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("Simulate error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

