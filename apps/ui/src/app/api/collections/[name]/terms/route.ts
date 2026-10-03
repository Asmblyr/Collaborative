import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ name: string }> };
export async function GET(request: Request, context: Context) {
  const { name } = await context.params;
  return proxyCore(request, `/collections/${encodeURIComponent(name)}/terms`, "GET");
}
export async function PUT(request: Request, context: Context) {
  const { name } = await context.params;
  return proxyCore(request, `/collections/${encodeURIComponent(name)}/terms`, "PUT");
}
