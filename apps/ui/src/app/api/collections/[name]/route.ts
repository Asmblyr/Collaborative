import { proxyCollectionDeletion } from "../deletion-proxy";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyCollectionDeletion(request, `/collections/${encodeURIComponent(name)}`, "DELETE");
}
