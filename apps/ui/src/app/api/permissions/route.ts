import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request) {
  return proxyCore(
    request,
    `/permissions${new URL(request.url).search}`,
    "GET",
  );
}
export async function POST(request: Request) {
  return proxyCore(request, "/permissions", "POST");
}
