import { proxyCore } from "@/lib/core-proxy";
export function GET(request: Request) {
  return proxyCore(request, "/workspaces", "GET");
}
export function POST(request: Request) {
  return proxyCore(request, "/workspaces", "POST");
}
