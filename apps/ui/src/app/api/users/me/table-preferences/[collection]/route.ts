import { proxyCore } from "@/lib/core-proxy";
type Context = { params: Promise<{ collection: string }> };
export async function GET(request: Request, context: Context) {
  const { collection } = await context.params;
  return proxyCore(
    request,
    `/users/me/table-preferences/${encodeURIComponent(collection)}`,
    "GET",
  );
}
export async function PATCH(request: Request, context: Context) {
  const { collection } = await context.params;
  return proxyCore(
    request,
    `/users/me/table-preferences/${encodeURIComponent(collection)}`,
    "PATCH",
  );
}
