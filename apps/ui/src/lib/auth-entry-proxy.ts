import { NextResponse } from "next/server";
import {
  coreAddress,
  cookieOptions,
  COOKIE_PREFIX,
  type TokenPair,
} from "./session";
import { hasForeignOrigin } from "./request-origin";
import { setSessionCookies } from "./session-cookies";
import { cookies } from "next/headers";

const challengeCookie = `${COOKIE_PREFIX}_passkey_challenge`;
/** Public authentication endpoints never return session tokens to browser JavaScript. */
export async function authEntryProxy(
  request: Request,
  path: string,
  mode: "options" | "passkey" | "link",
): Promise<Response> {
  if (hasForeignOrigin(request)) {
    return Response.json({ message: "Forbidden origin" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ message: "Ожидается JSON" }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Некорректный JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "Ожидается объект" }, { status: 400 });
  }
  try {
    if (
      mode === "passkey" &&
      (!("challengeId" in body) ||
        (await cookies()).get(challengeCookie)?.value !== body.challengeId)
    ) {
      return Response.json({ message: "Начните вход заново" }, { status: 401 });
    }
    const upstream = await fetch(coreAddress(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const result = await upstream.json();
    const response = NextResponse.json(
      upstream.ok && mode !== "options" ? { ok: true } : result,
      {
        status: upstream.status,
        headers: { "cache-control": "no-store" },
      },
    );
    if (upstream.ok && mode === "options") {
      response.cookies.set(
        challengeCookie,
        result.challengeId,
        cookieOptions(request, 300),
      );
    } else if (mode === "passkey") {
      response.cookies.delete(challengeCookie);
    }
    if (upstream.ok && mode !== "options") {
      setSessionCookies(response, request, result as TokenPair);
    }
    return response;
  } catch {
    return Response.json(
      { message: "Не удалось выполнить вход" },
      { status: 503 },
    );
  }
}
