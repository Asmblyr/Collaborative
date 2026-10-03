import { NextResponse } from "next/server";
import { coreAddress } from "./session";
import { hasForeignOrigin } from "./request-origin";
import { requestCoreWithSession } from "./core-session-request";
import { ACCESS_COOKIE, REFRESH_COOKIE, type TokenPair } from "./session";
import { cookies } from "next/headers";
import { setSessionCookies } from "./session-cookies";
import { SessionExpiredError } from "./renew-session";
import { oauthCookies } from "./oauth-cookies";

export async function proxyOAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  for (const name of ["content-type", "authorization", "accept", "origin"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cookie", oauthCookies(request.headers.get("cookie") ?? ""));
  const upstream = await fetch(coreAddress(url.pathname + url.search), {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    signal: AbortSignal.timeout(15000),
  });
  const outgoing = new Headers({
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
  });
  for (const name of ["content-type", "location", "www-authenticate"]) {
    const value = upstream.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) outgoing.append("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers: outgoing });
}

export async function submitOAuthInteraction(request: Request, uid: string): Promise<Response> {
  if (
    hasForeignOrigin(request) ||
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return Response.json({ message: "Недопустимый запрос" }, { status: 403 });
  }
  const jar = await cookies();
  let renewed: TokenPair | undefined;
  try {
    const upstream = await requestCoreWithSession(
      `/oauth-interactions/${encodeURIComponent(uid)}`,
      {
        method: "POST",
        body: await request.text(),
        timeoutMs: 10000,
        headers: { cookie: oauthCookies(jar.toString()) },
      },
      { accessToken: jar.get(ACCESS_COOKIE)?.value, refreshToken: jar.get(REFRESH_COOKIE)?.value },
      (pair) => {
        renewed = pair;
      },
    );
    const response = new NextResponse(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
    if (renewed) setSessionCookies(response, request, renewed);
    return response;
  } catch (error) {
    const response = NextResponse.json(
      { message: "Срок входа истёк. Вернитесь в приложение и повторите вход." },
      { status: error instanceof SessionExpiredError ? 401 : 503 },
    );
    if (renewed) setSessionCookies(response, request, renewed);
    return response;
  }
}
