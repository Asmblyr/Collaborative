import { proxyCore } from "@/lib/core-proxy";

export function POST(request: Request) {
  return proxyCore(request, "/assistant/messages", "POST", 310_000, true);
}
