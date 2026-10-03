import { proxyCore } from "@/lib/core-proxy";
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxyCore(request, `/oauth-apps/${encodeURIComponent((await context.params).id)}`, "PUT");
}
