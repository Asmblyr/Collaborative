import { proxyPublicFile } from "@/lib/public-file-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxyPublicFile(request, (await params).id);
}
