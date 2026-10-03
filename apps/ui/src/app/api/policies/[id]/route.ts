import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return proxyCore(
    request,
    `/policies/${encodeURIComponent((await params).id)}`,
    "GET",
  );
}
export async function PATCH(request: Request, { params }: Context) {
  return proxyCore(
    request,
    `/policies/${encodeURIComponent((await params).id)}`,
    "PATCH",
  );
}
export async function DELETE(request: Request, { params }: Context) {
  return proxyCore(
    request,
    `/policies/${encodeURIComponent((await params).id)}`,
    "DELETE",
  );
}
