import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ namespace: string; id: string }> },
) {
  const { namespace, id } = await params;
  return proxyCore(
    request,
    `/extensions/${encodeURIComponent(namespace)}/drafts/${encodeURIComponent(id)}`,
    "GET",
  );
}
