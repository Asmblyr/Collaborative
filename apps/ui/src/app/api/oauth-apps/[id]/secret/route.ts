import { proxyCore } from "@/lib/core-proxy";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxyCore(
    request,
    `/oauth-apps/${encodeURIComponent((await context.params).id)}/secret`,
    "POST",
  );
}
