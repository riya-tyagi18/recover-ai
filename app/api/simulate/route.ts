import { z } from "zod";
import { createOrReuseBatch } from "@/lib/db/batches";

const SimulateBody = z.object({
  seed: z.number().int().min(0).max(2_147_483_647),
  count: z.number().int().min(50).max(100),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = SimulateBody.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "seed must be an integer ≥ 0; count must be 50–100." },
      { status: 400 },
    );
  }

  try {
    const result = await createOrReuseBatch(parsed.data.seed, parsed.data.count);
    return Response.json(result);
  } catch (error: any) {
    console.error("Simulate error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
