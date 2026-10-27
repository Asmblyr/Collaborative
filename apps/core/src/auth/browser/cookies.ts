import type { FastifyReply, FastifyRequest } from "fastify";
import { isIP } from "node:net";

export interface BrowserConfig {
  origin: string;
  prefix: string;
  sessionDomain?: string;
}
declare module "fastify" {
  interface FastifyInstance {
    browserCookiePrefix: string;
  }
}

export function isPrivateCookie(value: string, prefix: string): boolean {
  const name = value.split("=", 1)[0].trim();
  return [prefix, "asmblyr"].some((key) => name.startsWith(`${key}_`));
}

export function browserConfig(
  origin: string,
  prefix = "asmblyr",
  domain?: string,
): BrowserConfig {
  if (!/^[a-zA-Z0-9_]{1,40}$/.test(prefix)) {
    throw new Error("Invalid SESSION_COOKIE_PREFIX");
  }
  const url = new URL(origin);
  if (!domain) {
    return { origin: url.origin, prefix };
  }
  const sessionDomain = domain.replace(/^\./, "").toLowerCase();
  if (
    isIP(sessionDomain) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      sessionDomain,
    ) ||
    sessionDomain.length > 253 ||
    (url.hostname !== sessionDomain &&
      !url.hostname.endsWith(`.${sessionDomain}`))
  ) {
    throw new Error(
      "SESSION_COOKIE_DOMAIN must be a parent domain of AUTH_UI_URL, never an IP or top-level domain",
    );
  }
  return { origin: url.origin, prefix, sessionDomain };
}

export function cookieValue(
  request: FastifyRequest,
  name: string,
): string | undefined {
  const matches = (request.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  // Ambiguous cookies must not select a different session in different handlers.
  return matches.length === 1 ? matches[0].slice(name.length + 1) : undefined;
}

export function setCookie(
  reply: FastifyReply,
  config: BrowserConfig,
  name: string,
  value: string,
  seconds: number,
  path = "/",
  domain?: string,
): void {
  const secure = config.origin.startsWith("https:") ? "; Secure" : "";
  reply.header(
    "set-cookie",
    `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(seconds))}${secure}${domain ? `; Domain=${domain}` : ""}`,
  );
}

export function clearSessionCookies(
  reply: FastifyReply,
  config: BrowserConfig,
): void {
  for (const suffix of ["session", "access", "refresh"]) {
    setCookie(reply, config, `${config.prefix}_${suffix}`, "", 0);
  }
  if (config.sessionDomain) {
    setCookie(
      reply,
      config,
      `${config.prefix}_session`,
      "",
      0,
      "/",
      config.sessionDomain,
    );
  }
}

export function requireBrowserOrigin(
  request: FastifyRequest,
  config: BrowserConfig,
): void {
  if (
    request.headers.origin !== config.origin ||
    request.headers["sec-fetch-site"] === "cross-site"
  ) {
    throw Object.assign(new Error("Forbidden origin"), { statusCode: 403 });
  }
}

export function registerBrowserCookies(
  app: import("fastify").FastifyInstance,
  config: BrowserConfig,
): void {
  app.decorate("browserCookiePrefix", config.prefix);
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.routeOptions.config.asmblyrPlugin) {
      const cookies = reply.getHeader("set-cookie");
      if (cookies) {
        reply.removeHeader("set-cookie");
        for (const cookie of Array.isArray(cookies)
          ? cookies
          : [String(cookies)]) {
          if (!isPrivateCookie(cookie, config.prefix)) {
            reply.header("set-cookie", cookie);
          }
        }
      }
    }
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    // The OAuth provider owns its own protocol cookies and client authentication.
    if (
      request.url.startsWith("/oauth/") &&
      request.routeOptions.url !== "/oauth/complete/:uid"
    ) {
      return;
    }
    const token = cookieValue(request, `${config.prefix}_session`);
    if (!token || request.headers.authorization) {
      return;
    }
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      requireBrowserOrigin(request, config);
    }
    request.headers.authorization = `Bearer ${token}`;
  });
}
