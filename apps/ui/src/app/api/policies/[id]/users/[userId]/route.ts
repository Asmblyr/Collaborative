import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ id: string; userId: string }> };
async function path({ params }: Context) {
  const { id, userId } = await params;
  return `/policies/${encodeURIComponent(id)}/users/${encodeURIComponent(userId)}`;
}
export async function PUT(request: Request, context: Context) {
  return proxyCore(request, await path(context), "PUT");
}
export async function DELETE(request: Request, context: Context) {
  return proxyCore(request, await path(context), "DELETE");
}
