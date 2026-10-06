import { proxyCore } from "@/lib/core-proxy";
export function GET(request: Request) {
  return proxyCore(request, "/users/me/extension", "GET");
}
export function PATCH(request: Request) {
  return proxyCore(request, "/users/me/extension", "PATCH");
}
