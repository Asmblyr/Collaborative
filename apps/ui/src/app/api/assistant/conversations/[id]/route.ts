import { proxyCore } from "@/lib/core-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyCore(
    request,
    "/assistant/conversations/" +
      encodeURIComponent(id) +
      new URL(request.url).search,
    "GET",
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return proxyCore(
    request,
    "/assistant/conversations/" + encodeURIComponent(id),
    "DELETE",
  );
}
