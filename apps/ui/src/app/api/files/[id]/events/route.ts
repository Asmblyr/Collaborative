import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyCore(
    request,
    `/files/${encodeURIComponent((await params).id)}/events`,
    "GET",
  );
}
