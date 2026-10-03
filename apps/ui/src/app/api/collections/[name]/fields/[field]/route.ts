import { proxyCollectionDeletion } from "../../../deletion-proxy";
import { proxyCore } from "@/lib/core-proxy";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string; field: string }> },
) {
  const { name, field } = await params;
  return proxyCore(request,
    `/collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}`, "PATCH");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string; field: string }> },
) {
  const { name, field } = await params;
  return proxyCollectionDeletion(request,
    `/collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}`, "DELETE",
  );
}
