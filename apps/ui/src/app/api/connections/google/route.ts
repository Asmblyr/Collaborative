import { proxyCore } from "@/lib/core-proxy";
export function GET(request: Request) {
  return proxyCore(request, "/connections/google", "GET");
}
export function DELETE(request: Request) {
  return proxyCore(request, "/connections/google", "DELETE", 30000);
}
