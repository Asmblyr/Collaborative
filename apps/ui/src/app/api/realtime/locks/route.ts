import { proxyCore } from "@/lib/core-proxy";

export function POST(request: Request) {
  return proxyCore(request, "/realtime/locks", "POST");
}

export function DELETE(request: Request) {
  return proxyCore(request, "/realtime/locks", "DELETE");
}
