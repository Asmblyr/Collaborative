import { proxyCore } from "@/lib/core-proxy";

export function GET(request: Request) { return proxyCore(request, "/assistant/status", "GET"); }
