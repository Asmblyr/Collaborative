import { proxyCore } from "@/lib/core-proxy";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  return proxyCore(
    request,
    `/collections/${encodeURIComponent(name)}/materialized-view`,
    "DELETE",
  );
}
