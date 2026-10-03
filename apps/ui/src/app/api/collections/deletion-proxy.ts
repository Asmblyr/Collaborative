import { proxyCore } from "@/lib/core-proxy";

export async function proxyCollectionDeletion(
  request: Request, path: string, method: "GET" | "DELETE",
): Promise<Response> {
  return proxyCore(request, path, method);
}
