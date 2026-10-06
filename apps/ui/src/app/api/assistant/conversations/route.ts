import { proxyCore } from "@/lib/core-proxy";

export function GET(request: Request) {
  return proxyCore(
    request,
    "/assistant/conversations" + new URL(request.url).search,
    "GET",
  );
}

export function POST(request: Request) {
  return proxyCore(request, "/assistant/conversations", "POST");
}
