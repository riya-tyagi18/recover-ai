import { getLatestBatch, listBatches } from "@/lib/db/batches";
import { requireOwner } from "@/lib/auth/guard";

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const [batches, latest] = await Promise.all([listBatches(), getLatestBatch()]);
    return Response.json({ batches, latest });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return Response.json({ error: message }, { status });
  }
}

