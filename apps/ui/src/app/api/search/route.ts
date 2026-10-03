import { proxyCore } from "@/lib/core-proxy";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return proxyCore(request, `/search?q=${encodeURIComponent(query)}`, "GET");
}
