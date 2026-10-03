import { proxyCore } from "@/lib/core-proxy";

export async function PUT(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  return proxyCore(request, `/collections/${encodeURIComponent(name)}/form`, "PUT");
}
