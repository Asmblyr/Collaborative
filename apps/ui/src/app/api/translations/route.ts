import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  return proxyCore(
    request,
    `/translations${query.size ? `?${query}` : ""}`,
    "GET",
  );
}
