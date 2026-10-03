import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyCore(
    request,
    `/users/${encodeURIComponent((await params).id)}/invitation`,
    "POST",
  );
}
