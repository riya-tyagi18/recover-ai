import { getBatch } from "@/lib/db/batches";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const batch = await getBatch(id);
  if (!batch) {
    return Response.json({ error: "Batch not found." }, { status: 404 });
  }
  return Response.json({ batch });
}
