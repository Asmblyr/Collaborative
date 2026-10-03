import { proxyCore } from "@/lib/core-proxy";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; federationId: string }> },
) {
  const { id, federationId } = await context.params;
  return proxyCore(
    request,
    `/service-accounts/${encodeURIComponent(id)}/federations/${encodeURIComponent(federationId)}`,
    "DELETE",
  );
}
