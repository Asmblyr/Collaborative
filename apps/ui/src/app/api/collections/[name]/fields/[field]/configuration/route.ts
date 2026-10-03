import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ name: string; field: string }> };

async function save(
  request: Request,
  context: Context,
  method: "PUT" | "POST",
) {
  const { name, field } = await context.params;
  const path = `/collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}/configuration`;
  return proxyCore(request, path, method);
}

export function PUT(request: Request, context: Context) {
  return save(request, context, "PUT");
}

export function POST(request: Request, context: Context) {
  return save(request, context, "POST");
}
