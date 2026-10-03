import { proxyCore } from "@/lib/core-proxy";

type Context = {
  params: Promise<{ collection: string; id: string; field: string }>;
};

export async function GET(request: Request, context: Context) {
  const { collection, id, field } = await context.params;
  const path = `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/relations/${encodeURIComponent(field)}/candidates`;
  return proxyCore(request, path + new URL(request.url).search, "GET");
}
