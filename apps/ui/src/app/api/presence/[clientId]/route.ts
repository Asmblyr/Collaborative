import { proxyCore } from "@/lib/core-proxy";
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  return proxyCore(
    request,
    `/presence/${encodeURIComponent(clientId)}`,
    "DELETE",
  );
}
