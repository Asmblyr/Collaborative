import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  coreAddress,
  cookieOptions,
  type TokenPair,
} from "./session";
import { requestCoreWithSession } from "./core-session-request";
import { setSessionCookies } from "./session-cookies";
import type { LoginProvider } from "./sso";

export const ssoCookie = (provider: string) => `asmblyr_sso_${provider}`;
export const ssoIntentCookie = (provider: string) =>
  `asmblyr_sso_intent_${provider}`;

export async function loadLoginProviders(): Promise<LoginProvider[]> {
  try {
    const response = await fetch(coreAddress("/auth/providers"), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    return ((await response.json()) as { data: LoginProvider[] }).data;
  } catch {
    return [];
  }
}

export async function ssoRequest(
  path: string,
  body: unknown,
  authenticated: boolean,
  request: Request,
  onRenew: (pair: TokenPair) => void,
): Promise<Response> {
  const options = {
    method: "POST",
    body: JSON.stringify(body),
    timeoutMs: 45_000,
    headers: { "user-agent": request.headers.get("user-agent") ?? "" },
  };
  if (authenticated) {
    const jar = await cookies();
    return requestCoreWithSession(
      path,
      options,
      {
        accessToken: jar.get(ACCESS_COOKIE)?.value,
        refreshToken: jar.get(REFRESH_COOKIE)?.value,
      },
      onRenew,
    );
  }
  return fetch(coreAddress(path), {
    ...options,
    headers: { ...options.headers, "content-type": "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs),
    cache: "no-store",
  });
}

export function ssoRedirect(
  request: Request,
  path: string,
  provider: string,
  renewed?: TokenPair,
): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const options = {
    ...cookieOptions(request, 0),
    path: `/sign/sso/${provider}`,
  };
  response.cookies.set(ssoCookie(provider), "", options);
  response.cookies.set(ssoIntentCookie(provider), "", options);
  if (renewed) setSessionCookies(response, request, renewed);
  return response;
}

export function ssoFailurePath(link: boolean, code: string): string {
  const path = link ? "/settings?tab=security&" : "/login?";
  return `${path}sso=${encodeURIComponent(code)}`;
}
