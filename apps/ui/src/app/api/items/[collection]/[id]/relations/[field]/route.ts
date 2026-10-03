import { proxyCore } from "@/lib/core-proxy";

type Context = {
  params: Promise<{ collection: string; id: string; field: string }>;
};

async function proxy(
  request: Request,
  context: Context,
  method: "GET" | "POST" | "PATCH",
) {
  const { collection, id, field } = await context.params;
  const path = `/items/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/relations/${encodeURIComponent(field)}`;
  return proxyCore(
    request,
    path + (method === "GET" ? new URL(request.url).search : ""),
    method,
  );
}

export const GET = (request: Request, context: Context) =>
  proxy(request, context, "GET");
export const POST = (request: Request, context: Context) =>
  proxy(request, context, "POST");
export const PATCH = (request: Request, context: Context) =>
  proxy(request, context, "PATCH");
