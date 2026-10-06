import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ name: string; id: string }> };
export async function GET(request: Request, context: Context) {
  const { name, id } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/records/${encodeURIComponent(id)}`,
    "GET",
  );
}
export async function PATCH(request: Request, context: Context) {
  const { name, id } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/records/${encodeURIComponent(id)}`,
    "PATCH",
  );
}
