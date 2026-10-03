import { proxyCore } from "@/lib/core-proxy";

async function proxy(request: Request, context: { params: Promise<{ collection: string }> }, method: "GET" | "POST") {
  const { collection } = await context.params;
  return proxyCore(request, `/table-views/${encodeURIComponent(collection)}`, method);
}
export function GET(request: Request, context: { params: Promise<{ collection: string }> }) { return proxy(request, context, "GET"); }
export function POST(request: Request, context: { params: Promise<{ collection: string }> }) { return proxy(request, context, "POST"); }
