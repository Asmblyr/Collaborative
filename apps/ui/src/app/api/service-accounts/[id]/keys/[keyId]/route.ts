import { proxyCore } from "@/lib/core-proxy";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; keyId: string }> },
) {
  const { id, keyId } = await context.params;
  return proxyCore(
    request,
    `/service-accounts/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyId)}`,
    "DELETE",
  );
}
