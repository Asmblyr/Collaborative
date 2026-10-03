import { proxyCore } from "@/lib/core-proxy";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params;
  return proxyCore(
    request,
    `/collections/${encodeURIComponent(name)}/settings`,
    "PATCH",
  );
}
