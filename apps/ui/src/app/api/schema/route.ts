import { proxyCore } from "@/lib/core-proxy";
import { cliPublicProxy } from "@/lib/cli-public-proxy";

export async function GET(request: Request) {
  const bearer = request.headers.get("authorization");
  if (bearer)
    return cliPublicProxy(
      request,
      `/schema${new URL(request.url).search}`,
      "GET",
      bearer,
    );
  return proxyCore(request, `/schema${new URL(request.url).search}`, "GET");
}
