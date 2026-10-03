import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyCore(request, `/service-accounts/${encodeURIComponent(id)}`, "GET");
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyCore(request, `/service-accounts/${encodeURIComponent(id)}`, "PUT");
}
