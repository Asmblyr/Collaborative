import { proxyCore } from "@/lib/core-proxy";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyCore(
    request,
    `/users/me/sessions/${encodeURIComponent(id)}`,
    "DELETE",
  );
}
