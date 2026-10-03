import { proxyCore } from "@/lib/core-proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyCore(
    request,
    `/users/me/identities/${encodeURIComponent(id)}`,
    "DELETE",
  );
}
