import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request) {
  return proxyCore(request, "/users/me", "GET");
}
export async function PATCH(request: Request) {
  return proxyCore(request, "/users/me", "PATCH");
}
