import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyCore(
    request,
    `/notifications/${encodeURIComponent(id)}/read`,
    "POST",
  );
}
