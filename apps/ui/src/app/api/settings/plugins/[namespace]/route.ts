import { proxyCore } from "@/lib/core-proxy";

type Context = { params: Promise<{ namespace: string }> };

async function forward(
  request: Request,
  context: Context,
  method: "GET" | "PUT",
) {
  const { namespace } = await context.params;
  if (!/^[a-z][a-z0-9_]*$/.test(namespace)) {
    return Response.json(
      { message: "Некорректное имя плагина" },
      { status: 400 },
    );
  }
  return proxyCore(
    request,
    `/settings/plugins/${encodeURIComponent(namespace)}`,
    method,
  );
}

export const GET = (request: Request, context: Context) =>
  forward(request, context, "GET");
export const PUT = (request: Request, context: Context) =>
  forward(request, context, "PUT");
