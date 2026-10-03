import { proxyCore } from "@/lib/core-proxy";

export function GET(request: Request) {
  return proxyCore(request, "/users/me/identities", "GET");
}
