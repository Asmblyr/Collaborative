import { proxyCore } from "@/lib/core-proxy";
import { proxyFileContent } from "@/lib/file-proxy";

export function GET(request: Request) {
  return proxyCore(request, `/files${new URL(request.url).search}`, "GET");
}
export function POST(request: Request) {
  return proxyFileContent(request, "/files", true);
}
