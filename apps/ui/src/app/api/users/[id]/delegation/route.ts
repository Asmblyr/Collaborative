import { proxyCore } from "@/lib/core-proxy";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyCore(
    request,
    `/users/${encodeURIComponent((await params).id)}/delegation`,
    "PUT",
  );
}
