import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request) {
  return proxyCore(request, "/service-accounts", "GET");
}
export async function POST(request: Request) {
  return proxyCore(request, "/service-accounts", "POST");
}
