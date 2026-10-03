import { proxyCore } from "@/lib/core-proxy";

export const GET = (request: Request) => proxyCore(request, `/settings/assistant/telemetry${new URL(request.url).search}`, "GET");
