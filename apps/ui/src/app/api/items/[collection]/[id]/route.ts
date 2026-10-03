import { proxyItemMutation } from "../../proxy";
import { proxyCore } from "@/lib/core-proxy";

type ItemParams = { params: Promise<{ collection: string; id: string }> };

export async function GET(request: Request, { params }: ItemParams) {
  const { collection, id } = await params;
  const query = new URLSearchParams();
  const fields = new URL(request.url).searchParams.get("fields");
  if (fields !== null) query.set("fields", fields);
  return proxyCore(
    request,
    `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}${query.size ? `?${query}` : ""}`,
    "GET",
  );
}

export async function PATCH(request: Request, { params }: ItemParams) {
  const { collection, id } = await params;
  return proxyItemMutation(request, collection, "PATCH", id);
}

export async function DELETE(request: Request, { params }: ItemParams) {
  const { collection, id } = await params;
  return proxyItemMutation(request, collection, "DELETE", id);
}
