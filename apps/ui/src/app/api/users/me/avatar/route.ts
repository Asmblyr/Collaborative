import { proxyFileContent } from "@/lib/file-proxy";
export function POST(request: Request) {
  return proxyFileContent(request, "/users/me/avatar", true, 2 * 1024 * 1024);
}
