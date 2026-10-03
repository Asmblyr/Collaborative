import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ collection: string; id: string }>;
  },
) {
  const { collection, id } = await params;
  return proxyCore(
    request,
    `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/related`,
    "GET",
  );
}
