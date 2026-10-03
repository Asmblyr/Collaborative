import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ collection: string; id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const { collection, id } = await params;
  return proxyCore(
    request,
    `/filter-presets/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    "PUT",
  );
}

export async function DELETE(request: Request, { params }: Context) {
  const { collection, id } = await params;
  return proxyCore(
    request,
    `/filter-presets/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`,
    "DELETE",
  );
}
