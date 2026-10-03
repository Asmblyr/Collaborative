import { proxyCore } from "@/lib/core-proxy";

export async function POST(request: Request, context: { params: Promise<{ collection: string }> }) {
  const { collection } = await context.params;
  return proxyCore(request, `/items/${encodeURIComponent(collection)}/commit`, "POST");
}
