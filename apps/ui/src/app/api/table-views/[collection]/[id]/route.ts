import { proxyCore } from "@/lib/core-proxy";

async function proxy(
  request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
  method: "PUT" | "DELETE",
) {
  const { collection, id } = await context.params;
  return proxyCore(
    request,
    `/table-views/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    method,
  );
}
export function PUT(
  request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
) {
  return proxy(request, context, "PUT");
}
export function DELETE(
  request: Request,
  context: { params: Promise<{ collection: string; id: string }> },
) {
  return proxy(request, context, "DELETE");
}
