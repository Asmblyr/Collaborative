import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return proxyCore(
    request,
    `/files/${encodeURIComponent((await context.params).id)}`,
    "GET",
  );
}
export async function PATCH(request: Request, context: Context) {
  return proxyCore(
    request,
    `/files/${encodeURIComponent((await context.params).id)}`,
    "PATCH",
  );
}
export async function DELETE(request: Request, context: Context) {
  return proxyCore(
    request,
    `/files/${encodeURIComponent((await context.params).id)}`,
    "DELETE",
    150000,
  );
}
