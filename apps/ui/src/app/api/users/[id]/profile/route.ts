import { proxyCore } from "@/lib/core-proxy";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return proxyCore(
    request,
    `/users/${encodeURIComponent((await context.params).id)}/profile`,
    "GET",
  );
}
export async function PATCH(request: Request, context: Context) {
  return proxyCore(
    request,
    `/users/${encodeURIComponent((await context.params).id)}/profile`,
    "PATCH",
  );
}
