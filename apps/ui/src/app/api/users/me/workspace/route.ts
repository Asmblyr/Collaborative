import { proxyCore } from "@/lib/core-proxy";
export function PUT(request: Request) {
  return proxyCore(request, "/users/me/workspace", "PUT");
}
