import { getLatestBatch, listBatches } from "@/lib/db/batches";

export async function GET() {
  const [batches, latest] = await Promise.all([listBatches(), getLatestBatch()]);
  return Response.json({ batches, latest });
}
