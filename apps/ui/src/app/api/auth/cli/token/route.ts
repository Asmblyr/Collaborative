import { cliPublicProxy } from "@/lib/cli-public-proxy";
export function POST(request: Request) {
  return cliPublicProxy(request, "/auth/cli/token", "POST");
}
