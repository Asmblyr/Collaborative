import { proxyCore } from "@/lib/core-proxy";

export const GET = (request: Request) =>
  proxyCore(request, "/settings/terms", "GET");
export const POST = (request: Request) =>
  proxyCore(request, "/settings/terms", "POST");
