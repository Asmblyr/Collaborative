import { proxyCore } from "@/lib/core-proxy";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  return proxyCore(
    request,
    `/connections/google/writes/${encodeURIComponent((await params).id)}`,
    "GET",
  );
}
export async function DELETE(request: Request, { params }: Context) {
  return proxyCore(
    request,
    `/connections/google/writes/${encodeURIComponent((await params).id)}`,
    "DELETE",
  );
}
