import { proxyCore } from "@/lib/core-proxy";
export function GET(request: Request) {
  return proxyCore(request, "/users/profile-extension", "GET");
}
export function PUT(request: Request) {
  return proxyCore(request, "/users/profile-extension", "PUT");
}
