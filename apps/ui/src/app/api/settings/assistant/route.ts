import { proxyCore } from "@/lib/core-proxy";

export const GET = (request: Request) =>
  proxyCore(request, "/settings/assistant", "GET");
export const PUT = (request: Request) =>
  proxyCore(request, "/settings/assistant", "PUT");
