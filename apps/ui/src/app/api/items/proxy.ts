import { proxyCore } from "@/lib/core-proxy";

export async function proxyItemMutation(
  request: Request,
  collection: string,
  method: "POST" | "PATCH" | "DELETE",
  id?: string,
): Promise<Response> {
  const path =
    `/items/${encodeURIComponent(collection)}` +
    (id ? `/${encodeURIComponent(id)}` : "");
  return proxyCore(request, path, method);
}
