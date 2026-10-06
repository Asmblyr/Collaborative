import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ name: string; field: string }> };
export async function POST(request: Request, context: Context) {
  const { name, field } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}/configuration`,
    "POST",
  );
}
export async function PUT(request: Request, context: Context) {
  const { name, field } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}/configuration`,
    "PUT",
  );
}
