import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/records${new URL(request.url).search}`,
    "GET",
  );
}
