import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ id: string; permissionId: string }> };
async function path({ params }: Context) {
  const { id, permissionId } = await params;
  return `/policies/${encodeURIComponent(id)}/permissions/${encodeURIComponent(permissionId)}`;
}
export async function PUT(request: Request, context: Context) {
  return proxyCore(request, await path(context), "PUT");
}
export async function DELETE(request: Request, context: Context) {
  return proxyCore(request, await path(context), "DELETE");
}
