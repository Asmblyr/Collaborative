import { proxyCore } from "@/lib/core-proxy";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyCore(
    request,
    `/connections/google/writes/${encodeURIComponent((await params).id)}/confirm`,
    "POST",
    60000,
  );
}
