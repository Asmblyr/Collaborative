import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, safeNext } from "@/lib/session";
import { renewSession, SessionExpiredError } from "@/lib/renew-session";
import { setSessionCookies } from "@/lib/session-cookies";
import { getUiCopy } from "@/lib/ui-copy-server";

export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  const login = new URL(`/login?next=${encodeURIComponent(next)}`, request.url);
  if (!token) return NextResponse.redirect(login);
  try {
    const pair = await renewSession(token);
    const response = NextResponse.redirect(new URL(next, request.url));
    response.headers.set("Cache-Control", "no-store");
    setSessionCookies(response, request, pair);
    return response;
  } catch (error) {
    if (!(error instanceof SessionExpiredError)) {
      const copy = await getUiCopy();
      return new NextResponse(
        copy(
          "Core API временно недоступен. Обновите страницу, чтобы повторить вход.",
        ),
        {
          status: 503,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
        },
      );
    }
    const response = NextResponse.redirect(login);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }
}
