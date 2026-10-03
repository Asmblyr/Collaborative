import { proxyCore } from "@/lib/core-proxy";

export function GET(request: Request) {
  return proxyCore(
    request,
    `/files/resolve${new URL(request.url).search}`,
    "GET",
  );
}
