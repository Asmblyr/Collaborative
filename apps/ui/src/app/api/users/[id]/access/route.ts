import { proxyCore } from "@/lib/core-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyCore(
    request,
    `/users/${encodeURIComponent((await params).id)}/access`,
    "GET",
  );
}
