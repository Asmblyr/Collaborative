import { proxyCore } from "@/lib/core-proxy";
export async function GET(request: Request) {
  return proxyCore(request, "/users/me/sessions", "GET");
}
