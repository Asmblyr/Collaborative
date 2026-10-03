import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCore(
    request,
    `/assistant/messages/${encodeURIComponent(id)}/cancel`,
    "POST",
  );
}
