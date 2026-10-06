import { NextResponse } from "next/server";
import { ssoRequest } from "./sso-server";
import { cookieOptions, type TokenPair } from "./session";
import { setSessionCookies } from "./session-cookies";
export const GOOGLE_CONNECTION_COOKIE = "asmblyr_google_connection";
export const googleRequest = (
  request: Request,
  path: string,
  body: object,
  onRenew: (pair: TokenPair) => void,
) => ssoRequest(path, body, true, request, onRenew);
export function googleCallbackResponse(
  request: Request,
  status: string,
  renewed?: TokenPair,
) {
  const response = NextResponse.redirect(
    new URL(`/settings?tab=applications&connection=${status}`, request.url),
    303,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(GOOGLE_CONNECTION_COOKIE, "", {
    ...cookieOptions(request, 0),
    path: "/connections/google",
  });
  if (renewed) {
    setSessionCookies(response, request, renewed);
  }
  return response;
}
