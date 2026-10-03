import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyCore(
    request,
    `/collections/${encodeURIComponent(name)}/relations`,
    "POST",
  );
}
