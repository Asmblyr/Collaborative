import { proxyCollectionDeletion } from "../../deletion-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  return proxyCollectionDeletion(request, `/collections/${encodeURIComponent(name)}/impact`, "GET");
}
