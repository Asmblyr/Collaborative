import { proxyCore } from "@/lib/core-proxy";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ name: string; field: string }> },
) {
  const { name, field } = await context.params;
  return proxyCore(
    request,
    `/system-collections/${encodeURIComponent(name)}/fields/${encodeURIComponent(field)}`,
    "DELETE",
  );
}
