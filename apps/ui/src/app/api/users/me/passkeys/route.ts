import { proxyCore } from "@/lib/core-proxy";
export function GET(request: Request) {
  return proxyCore(request, "/users/me/passkeys", "GET");
}
export function POST(request: Request) {
  return proxyCore(request, "/users/me/passkeys", "POST");
}
