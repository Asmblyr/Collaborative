import { proxyCore } from "@/lib/core-proxy";

type RouteParams = { params: Promise<{ collection: string }> };

export async function GET(request: Request, { params }: RouteParams) {
  const { collection } = await params;
  const incoming = new URL(request.url);
  const target = new URL(`/item-events/${encodeURIComponent(collection)}`, "http://localhost");
  for (const key of ["item", "limit", "before"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }

  return proxyCore(request, target.pathname + target.search, "GET");
}
