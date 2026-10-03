import { proxyCore } from "@/lib/core-proxy";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCore(request, `/settings/terms/${encodeURIComponent(id)}`, "PUT");
}
