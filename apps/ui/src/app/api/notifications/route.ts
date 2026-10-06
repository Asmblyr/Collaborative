import { proxyCore } from "@/lib/core-proxy";

export function GET(request: Request) {
  return proxyCore(
    request,
    `/notifications${new URL(request.url).search}`,
    "GET",
  );
}
