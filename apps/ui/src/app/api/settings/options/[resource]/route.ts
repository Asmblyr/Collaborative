import { proxyCore } from "@/lib/core-proxy";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  const { resource } = await params;
  if (!["users", "policies", "collections"].includes(resource)) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }
  return proxyCore(request, `/settings/options/${resource}`, "GET");
}
