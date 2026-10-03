import { proxyCore } from "@/lib/core-proxy";
async function proxy(request: Request, context: { params: Promise<{ id: string }> }, method: "PUT" | "DELETE") {
  const { id } = await context.params;
  return proxyCore(request, `/workspaces/${encodeURIComponent(id)}`, method);
}
export function PUT(request: Request, context: { params: Promise<{ id: string }> }) { return proxy(request, context, "PUT"); }
export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { return proxy(request, context, "DELETE"); }
