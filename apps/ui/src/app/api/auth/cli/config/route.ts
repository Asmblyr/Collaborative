import { cliPublicProxy } from "@/lib/cli-public-proxy";
export function GET(request: Request) {
  return cliPublicProxy(request, "/auth/cli/config", "GET");
}
