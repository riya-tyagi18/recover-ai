import { getBatch } from "@/lib/db/batches";
import { requireOwner } from "@/lib/auth/guard";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireOwner(request);
    const { id } = await context.params;
    const batch = await getBatch(id);
    if (!batch) {
      return Response.json({ error: "Batch not found." }, { status: 404 });
    }
    return Response.json({ batch });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 500;
    const message = (err as Error).message || "Unauthorized";
    return Response.json({ error: message }, { status });
  }
}

