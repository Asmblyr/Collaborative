import { proxyCore } from "@/lib/core-proxy";

export async function PUT(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  const { section } = await context.params;
  return proxyCore(
    request,
    `/settings/integrations/${encodeURIComponent(section)}`,
    "PUT",
    120000,
  );
}
