import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ collection: string; id: string; field: string; linkId: string }> };
async function proxy(request: Request, context: Context, method: "GET" | "PATCH") {
  const { collection, id, field, linkId } = await context.params;
  return proxyCore(request, `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/relations/${encodeURIComponent(field)}/links/${encodeURIComponent(linkId)}`, method);
}
export const GET = (request: Request, context: Context) => proxy(request, context, "GET");
export const PATCH = (request: Request, context: Context) => proxy(request, context, "PATCH");
