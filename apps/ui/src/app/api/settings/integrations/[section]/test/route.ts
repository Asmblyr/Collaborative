import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ section: string }> },
) {
  const { section } = await context.params;
  return proxyCore(
    request,
    `/settings/integrations/${encodeURIComponent(section)}/test`,
    "POST",
    60000,
  );
}
