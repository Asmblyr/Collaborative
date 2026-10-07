import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, type TokenPair } from "@/lib/session";
import { requestCoreWithSession } from "@/lib/core-session-request";
import { SessionExpiredError } from "@/lib/renew-session";
import { setSessionCookies } from "@/lib/session-cookies";

export async function GET(request: Request) {
  const jar = await cookies();
  const query = new URL(request.url).search;
  let renewed: TokenPair | undefined;
  try {
    const upstream = await requestCoreWithSession(
      `/realtime/stream${query}`,
      {
        method: "GET",
        timeoutMs: 60 * 60 * 1000,
        signal: request.signal,
        headers: { accept: "text/event-stream" },
      },
      {
        accessToken: jar.get(ACCESS_COOKIE)?.value,
        refreshToken: jar.get(REFRESH_COOKIE)?.value,
      },
      (pair) => {
        renewed = pair;
      },
    );
    const streaming =
      upstream.ok &&
      upstream.headers.get("content-type")?.startsWith("text/event-stream");
    const response = new NextResponse(
      streaming ? upstream.body : await upstream.text(),
      {
        status: upstream.status,
        headers: {
          "content-type": streaming
            ? "text/event-stream; charset=utf-8"
            : "application/json",
          "cache-control": "no-store, no-transform",
          "x-accel-buffering": "no",
        },
      },
    );
    if (renewed) setSessionCookies(response, request, renewed);
    return response;
  } catch (error) {
    const expired = error instanceof SessionExpiredError;
    const response = NextResponse.json(
      {
        code: expired ? "INVALID_CREDENTIALS" : "UPSTREAM_UNAVAILABLE",
        message: expired ? "Требуется вход" : "Core API недоступен",
      },
      { status: expired ? 401 : 503, headers: { "cache-control": "no-store" } },
    );
    if (expired) {
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
    if (renewed) setSessionCookies(response, request, renewed);
    return response;
  }
}
