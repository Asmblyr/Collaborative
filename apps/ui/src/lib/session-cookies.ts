import type { NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  cookieOptions,
  type TokenPair,
} from "./session";

export function setSessionCookies(
  response: NextResponse,
  request: Request,
  pair: TokenPair,
): void {
  response.cookies.set(
    ACCESS_COOKIE,
    pair.accessToken,
    cookieOptions(request, pair.expiresIn),
  );
  response.cookies.set(
    REFRESH_COOKIE,
    pair.refreshToken,
    cookieOptions(
      request,
      Math.max(
        0,
        Math.floor(
          (new Date(pair.refreshExpiresAt).getTime() - Date.now()) / 1000,
        ),
      ),
    ),
  );
}
