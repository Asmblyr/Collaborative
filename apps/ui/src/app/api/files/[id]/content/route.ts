import { proxyFileContent } from "@/lib/file-proxy";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const query =
    new URL(request.url).searchParams.get("preview") === "1"
      ? "?preview=1"
      : "";
  return proxyFileContent(
    request,
    `/files/${encodeURIComponent((await params).id)}/content${query}`,
  );
}
