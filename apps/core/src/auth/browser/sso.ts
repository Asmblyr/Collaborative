import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { SsoService } from "../sso/service.js";
import { parseSsoCallback, safeReturnTo, SsoError } from "../sso/input.js";
import { credentialRateLimit } from "../rate-limit.js";
import {
  cookieValue,
  requireBrowserOrigin,
  setCookie,
  type BrowserConfig,
} from "./cookies.js";
import { startBrowserSession } from "./sessions.js";

export function registerBrowserSso(
  app: FastifyInstance,
  database: Knex | null,
  sso: SsoService,
  config: BrowserConfig,
): void {
  app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 8192 },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(String(body))));
      },
    );
    const db = () => {
      if (!database) {
        throw Object.assign(new Error("Database unavailable"), {
          statusCode: 503,
        });
      }
      return database;
    };
    const failure = (link: boolean, error: unknown) => {
      const code =
        error instanceof SsoError ? error.code : "SSO_PROVIDER_UNAVAILABLE";
      return `${link ? "/settings?tab=security&" : "/login?"}sso=${encodeURIComponent(code)}`;
    };
    scope.post<{ Params: { provider: string } }>(
      "/sign/sso/:provider",
      { preHandler: credentialRateLimit(60) },
      async (request, reply) => {
        requireBrowserOrigin(request, config);
        const { provider } = request.params;
        if (!sso.providers.some((entry) => entry.id === provider)) {
          return reply.code(404).send();
        }
        const form = request.body as Record<string, unknown> | undefined;
        const link = form?.intent === "link";
        reply
          .header("Cache-Control", "no-store")
          .header("Referrer-Policy", "no-referrer");
        try {
          const browserToken = randomBytes(32).toString("base64url");
          const result = await sso.start(
            db(),
            provider,
            {
              browserToken,
              intent: link ? "link" : "login",
              returnTo: safeReturnTo(form?.next),
              uiOrigin: config.origin,
            },
            request.headers.authorization,
          );
          const path = `/sign/sso/${provider}`;
          setCookie(
            reply,
            config,
            `${config.prefix}_sso_${provider}`,
            browserToken,
            600,
            path,
          );
          setCookie(
            reply,
            config,
            `${config.prefix}_sso_intent_${provider}`,
            link ? "link" : "login",
            600,
            path,
          );
          return reply.redirect(result.authorizationUrl, 303);
        } catch (error) {
          return reply.redirect(failure(link, error), 303);
        }
      },
    );
    scope.get<{ Params: { provider: string } }>(
      "/sign/sso/:provider/callback",
      { preHandler: credentialRateLimit(120) },
      async (request, reply) => {
        const { provider } = request.params;
        if (!sso.providers.some((entry) => entry.id === provider)) {
          return reply.code(404).send();
        }
        const name = `${config.prefix}_sso_${provider}`;
        const intent = `${config.prefix}_sso_intent_${provider}`;
        const link = cookieValue(request, intent) === "link";
        reply
          .header("Cache-Control", "no-store")
          .header("Referrer-Policy", "no-referrer");
        for (const cookie of [name, intent])
          setCookie(reply, config, cookie, "", 0, `/sign/sso/${provider}`);
        try {
          const input = parseSsoCallback({
            browserToken: cookieValue(request, name),
            query: request.url.split("?")[1] ?? "",
          });
          const result = await sso.complete(
            db(),
            provider,
            input,
            request.headers.authorization,
            request.headers["user-agent"],
          );
          if (result.intent === "login") {
            await startBrowserSession(db(), result.tokens, reply, config);
          }
          return reply.redirect(
            result.intent === "link"
              ? "/settings?tab=security&sso=SSO_LINKED"
              : safeReturnTo(result.returnTo),
            303,
          );
        } catch (error) {
          return reply.redirect(failure(link, error), 303);
        }
      },
    );
  });
}
