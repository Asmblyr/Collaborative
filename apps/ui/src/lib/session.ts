import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError, createClient } from "@asmblyr-collaborative/sdk";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
export { safeNext } from "./safe-next";

export const COOKIE_PREFIX = process.env.SESSION_COOKIE_PREFIX ?? "asmblyr";
if (!/^[a-zA-Z0-9_]{1,40}$/.test(COOKIE_PREFIX)) {
  throw new Error("Invalid SESSION_COOKIE_PREFIX");
}
export const ACCESS_COOKIE = `${COOKIE_PREFIX}_access`;
export const REFRESH_COOKIE = `${COOKIE_PREFIX}_refresh`;
const coreUrl = process.env.CORE_URL ?? "http://127.0.0.1:3001";

export type SessionUser = CurrentUser;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: string;
}

export function coreAddress(path: string): URL {
  return new URL(path, coreUrl);
}

export function cookieOptions(request: Request, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      request.headers.get("x-forwarded-proto") === "https" ||
      new URL(request.url).protocol === "https:",
    path: "/",
    maxAge,
  };
}

export function sessionRedirect(path: string, hasRefresh: boolean): never {
  redirect(
    hasRefresh
      ? `/auth/renew?next=${encodeURIComponent(path)}`
      : `/login?next=${encodeURIComponent(path)}`,
  );
}

export const loadSessionUser = cache(
  async (token: string): Promise<SessionUser | null> => {
    const client = createClient({
      baseUrl: coreAddress("/").href,
      accessToken: token,
      timeoutMs: 5000,
    });
    try {
      return (await client.users.me()).data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw new Error("Core API недоступен", { cause: error });
    }
  },
);

export async function requireSession(
  path: string,
): Promise<{ user: SessionUser; token: string }> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) sessionRedirect(path, jar.has(REFRESH_COOKIE));
  const user = await loadSessionUser(token);
  if (!user) sessionRedirect(path, jar.has(REFRESH_COOKIE));
  return { user, token };
}
