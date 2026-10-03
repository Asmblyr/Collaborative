import { coreAddress } from "@/lib/session";
import { hasForeignOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (hasForeignOrigin(request)) return Response.json({ message: "Forbidden origin" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ message: "Ожидается JSON" }, { status: 415 });
  }
  try {
    const upstream = await fetch(coreAddress("/auth/invitations/accept"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: await request.text(), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    return new Response(await upstream.text(), { status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Core API недоступен" }, { status: 503 });
  }
}
