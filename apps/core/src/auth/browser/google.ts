import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { GoogleConnections } from "../../connections/google/connections.js";
import {
  startGoogleFlow,
  finishGoogleFlow,
} from "../../connections/google/flows.js";
import { loadAccess, requireHuman } from "../../permissions/access.js";
import { credentialRateLimit } from "../rate-limit.js";
import {
  cookieValue,
  requireBrowserOrigin,
  setCookie,
  type BrowserConfig,
} from "./cookies.js";

export function registerBrowserGoogle(
  app: FastifyInstance,
  db: Knex | null,
  google: GoogleConnections | null,
  config: BrowserConfig,
): void {
  const authorize = async (authorization?: string) => {
    if (!db) {
      throw Object.assign(new Error("Google connection unavailable"), {
        statusCode: 503,
      });
    }
    const access = await loadAccess(db, authorization);
    requireHuman(access);
    if (!google) {
      throw Object.assign(new Error("Google connection unavailable"), {
        statusCode: 503,
      });
    }
    return access;
  };
  const name = `${config.prefix}_google_connection`;
  // Keep the registered Google callback URL unchanged. API start is a separate browser operation.
  app.post(
    "/auth/browser/google/start",
    { preHandler: credentialRateLimit(12) },
    async (request, reply) => {
      requireBrowserOrigin(request, config);
      const access = await authorize(request.headers.authorization);
      const result = await startGoogleFlow(google!, access.principal.id);
      setCookie(
        reply,
        config,
        name,
        result.browserToken,
        600,
        "/connections/google",
      );
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: { url: result.url } });
    },
  );
  app.get(
    "/connections/google/callback",
    { preHandler: credentialRateLimit(12) },
    async (request, reply) => {
      reply
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer");
      setCookie(reply, config, name, "", 0, "/connections/google");
      let status = "failed";
      try {
        const access = await authorize(request.headers.authorization);
        await finishGoogleFlow(
          google!,
          access,
          {
            browserToken: cookieValue(request, name),
            query: request.url.split("?")[1] ?? "",
          },
          () => authorize(request.headers.authorization),
        );
        status = "connected";
      } catch {
        // Provider details and credentials must not enter redirects or the response.
      }
      return reply.redirect(
        `/settings?tab=applications&connection=${status}`,
        303,
      );
    },
  );
}
