import { proxyCore } from "@/lib/core-proxy";

export async function POST(
  request: Request,
  context: {
    params: Promise<{ collection: string; id: string; field: string }>;
  },
) {
  const { collection, id, field } = await context.params;
  return proxyCore(
    request,
    `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/relations/${encodeURIComponent(field)}/records`,
    "POST",
  );
}
