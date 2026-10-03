import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, type TokenPair } from "./session";
import { hasForeignOrigin } from "./request-origin";
import { requestCoreWithSession } from "./core-session-request";
import { SessionExpiredError } from "./renew-session";
import { setSessionCookies } from "./session-cookies";
import {
  PluginBodyTooLarge,
  pluginRequestHeaders,
  pluginResponse,
  readPluginBody,
} from "./plugin-http";

export async function proxyCore(
  request: Request,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  timeoutMs = 10000,
  stream = false,
  { pluginOnly = false }: { pluginOnly?: boolean } = {},
): Promise<Response> {
  if (method !== "GET") {
    if (hasForeignOrigin(request)) {
      return Response.json({ message: "Forbidden origin" }, { status: 403 });
    }
  }
  if (
    !pluginOnly &&
    (method === "POST" ||
      method === "PATCH" ||
      (method === "PUT" && request.headers.has("content-type"))) &&
    !request.headers.get("content-type")?.startsWith("application/json")
  ) {
    return Response.json({ message: "Ожидается JSON" }, { status: 415 });
  }
  const jar = await cookies();
  const withBody =
    method === "POST" ||
    method === "PATCH" ||
    (method === "PUT" && request.headers.get("content-type")?.startsWith("application/json"));
  let renewed: TokenPair | undefined;
  let response: NextResponse;
  try {
    let body: BodyInit | undefined;
    if (pluginOnly) body = await readPluginBody(request);
    else if (withBody) body = await request.text();
    const upstream = await requestCoreWithSession(
      path,
      {
        method,
        body,
        timeoutMs,
        signal: request.signal,
        redirect: pluginOnly ? "manual" : undefined,
        headers: {
          ...(stream ? { accept: "application/x-ndjson" } : {}),
          ...(pluginOnly ? pluginRequestHeaders(request) : {}),
        },
      },
      { accessToken: jar.get(ACCESS_COOKIE)?.value, refreshToken: jar.get(REFRESH_COOKIE)?.value },
      (pair) => {
        renewed = pair;
      },
    );
    if (pluginOnly) {
      const forwarded = pluginResponse(upstream);
      response = new NextResponse(forwarded.body, {
        status: forwarded.status,
        headers: forwarded.headers,
      });
    } else {
      const streaming =
        stream && upstream.headers.get("content-type")?.startsWith("application/x-ndjson");
      let responseBody: BodyInit | null = null;
      if (upstream.status !== 204) responseBody = streaming ? upstream.body : await upstream.text();
      response = new NextResponse(responseBody, {
        status: upstream.status,
        headers:
          upstream.status === 204
            ? { "cache-control": "no-store" }
            : {
                "content-type": streaming
                  ? "application/x-ndjson; charset=utf-8"
                  : "application/json",
                "cache-control": "no-store, no-transform",
                "x-accel-buffering": "no",
              },
      });
    }
  } catch (error) {
    const expired = error instanceof SessionExpiredError;
    let status = 503;
    let message = "Core API недоступен";
    if (error instanceof PluginBodyTooLarge) {
      status = 413;
      message = error.message;
    } else if (expired) {
      status = 401;
      message = "Требуется вход";
    }
    response = NextResponse.json({ message }, { status, headers: { "cache-control": "no-store" } });
    if (expired) {
      response.cookies.delete(ACCESS_COOKIE);
      response.cookies.delete(REFRESH_COOKIE);
    }
  }
  if (renewed) setSessionCookies(response, request, renewed);
  return response;
}
