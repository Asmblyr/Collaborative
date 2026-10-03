import { proxyCore } from "@/lib/core-proxy";

interface Context {
  params: Promise<{ path: string[] }>;
}

async function forward(
  request: Request,
  { params }: Context,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
): Promise<Response> {
  const segments = (await params).path;
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return Response.json({ message: "Invalid endpoint path" }, { status: 400 });
  }
  const path = `/${segments.map(encodeURIComponent).join("/")}${new URL(request.url).search}`;
  return proxyCore(request, path, method, 10000, false, { pluginOnly: true });
}

export function GET(request: Request, context: Context) {
  return forward(request, context, "GET");
}

export function POST(request: Request, context: Context) {
  return forward(request, context, "POST");
}

export function PUT(request: Request, context: Context) {
  return forward(request, context, "PUT");
}

export function PATCH(request: Request, context: Context) {
  return forward(request, context, "PATCH");
}

export function DELETE(request: Request, context: Context) {
  return forward(request, context, "DELETE");
}
