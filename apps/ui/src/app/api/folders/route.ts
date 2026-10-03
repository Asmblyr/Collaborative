import { proxyCore } from "@/lib/core-proxy";

export async function POST(request: Request) {
  return proxyCore(request, "/folders", "POST");
}
