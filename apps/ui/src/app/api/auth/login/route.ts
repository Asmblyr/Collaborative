import { NextResponse } from "next/server";
import { coreAddress } from "@/lib/session";
import type { TokenPair } from "@/lib/session";
import { hasForeignOrigin } from "@/lib/request-origin";
import { setSessionCookies } from "@/lib/session-cookies";

export async function POST(request: Request) {
  if (hasForeignOrigin(request)) {
    return Response.json({ message: "Forbidden origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ message: "Ожидается JSON" }, { status: 415 });
  }
  try {
    const upstream = await fetch(coreAddress("/auth/login"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }
    const pair = (await upstream.json()) as TokenPair;
    const response = NextResponse.json({ ok: true });
    response.headers.set("Cache-Control", "no-store");
    setSessionCookies(response, request, pair);
    return response;
  } catch {
    return Response.json({ message: "Core API недоступен" }, { status: 503 });
  }
}
