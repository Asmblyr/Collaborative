import { NextResponse } from "next/server";
import { hasForeignOrigin } from "@/lib/request-origin";
import { cookieOptions, type TokenPair } from "@/lib/session";
import { setSessionCookies } from "@/lib/session-cookies";
import {
  GOOGLE_CONNECTION_COOKIE,
  googleRequest,
} from "@/lib/google-connection-server";
export async function POST(request: Request) {
  if (hasForeignOrigin(request)) {
    return new Response(null, { status: 403 });
  }
  let renewed: TokenPair | undefined;
  try {
    const upstream = await googleRequest(
      request,
      "/connections/google/start",
      {},
      (pair) => {
        renewed = pair;
      },
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { message: "Не удалось начать подключение Google." },
        { status: upstream.status },
      );
    }
    const result = (await upstream.json()) as {
      data: { url: string; browserToken: string };
    };
    const response = NextResponse.json(
      { data: { url: result.data.url } },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(GOOGLE_CONNECTION_COOKIE, result.data.browserToken, {
      ...cookieOptions(request, 600),
      path: "/connections/google",
    });
    if (renewed) {
      setSessionCookies(response, request, renewed);
    }
    return response;
  } catch {
    return NextResponse.json(
      { message: "Не удалось начать подключение Google." },
      { status: 503 },
    );
  }
}
