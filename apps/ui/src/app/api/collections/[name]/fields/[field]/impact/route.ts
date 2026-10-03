import { proxyCollectionDeletion } from "../../../../deletion-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string; field: string }> },
) {
  const { name, field } = await params;
  return proxyCollectionDeletion(
    request,
    `/collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}/impact`,
    "GET",
  );
}
