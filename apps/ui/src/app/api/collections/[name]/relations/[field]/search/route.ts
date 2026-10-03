import { proxyCore } from "@/lib/core-proxy";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ name: string; field: string }> },
) {
  const { name, field } = await params;
  return proxyCore(
    request,
    `/collections/${encodeURIComponent(name)}/relations/${encodeURIComponent(field)}/search`,
    "PUT",
  );
}
