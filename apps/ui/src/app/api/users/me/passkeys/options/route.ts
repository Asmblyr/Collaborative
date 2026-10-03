import { proxyCore } from "@/lib/core-proxy";
export function POST(request: Request) {
  return proxyCore(request, "/users/me/passkeys/options", "POST");
}
