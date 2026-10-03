import { proxyCore } from "@/lib/core-proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCore(request, `/folders/${encodeURIComponent(id)}`, "PATCH");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCore(request, `/folders/${encodeURIComponent(id)}`, "DELETE");
}
