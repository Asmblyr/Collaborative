import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ collection: string }> };

export async function GET(request: Request, { params }: Context) {
  return proxyCore(request, `/filter-presets/${encodeURIComponent((await params).collection)}`, "GET");
}

export async function POST(request: Request, { params }: Context) {
  return proxyCore(request, `/filter-presets/${encodeURIComponent((await params).collection)}`, "POST");
}
