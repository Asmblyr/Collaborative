import middie from "@fastify/middie";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import { parseId } from "../policies/validation.js";
import type { OAuthConfig } from "./config.js";
import { createOAuthProvider } from "./provider.js";
import { parseApplication } from "./input.js";
import { registerOAuthInteractions } from "./interactions.js";
import { OAuthConsents } from "./consents.js";
import { registerOAuthConsentRoutes } from "./consent-routes.js";

export function registerOAuthRoutes(
  app: FastifyInstance,
  db: Knex | null,
  config?: OAuthConfig,
): void {
  app.get("/oauth-apps/status", async (request, reply) => {
    if (!db) {
      throw Object.assign(new Error("Database unavailable"), {
        statusCode: 503,
      });
    }
    await requireSettingsRead(db, request, "oauth");
    return reply.header("Cache-Control", "no-store").send({
      data: { enabled: Boolean(config), issuer: config?.issuer ?? null },
    });
  });
  if (!db) {
    return;
  }
  if (!config) {
    registerOAuthConsentRoutes(app, db, new OAuthConsents(db));
    return;
  }
  const { applications, provider } = createOAuthProvider(db, config);
  const consents = new OAuthConsents(db, applications);
  provider.on("server_error", (_context, error: Error) => {
    app.log.error({ errorName: error.name }, "OAuth provider failure");
  });
  const admin = {
    preHandler: [
      credentialRateLimit(90),
      async (request: Parameters<typeof requireSettingsSection>[1]) => {
        await requireSettingsSection(db, request, "oauth");
      },
    ],
  };
  const reader = {
    preHandler: [
      credentialRateLimit(90),
      (request: Parameters<typeof requireSettingsRead>[1]) =>
        requireSettingsRead(db, request, "oauth"),
    ],
  };
  app.get("/oauth-apps", reader, async (_request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send({ data: await applications.list() }),
  );
  app.post("/oauth-apps", admin, async (request, reply) => {
    const user = await requireSettingsSection(db, request, "oauth");
    const result = await applications.save(
      null,
      parseApplication(request.body),
      user.id,
    );
    return reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({ data: result });
  });
  app.put<{ Params: { id: string } }>(
    "/oauth-apps/:id",
    admin,
    async (request, reply) => {
      const user = await requireSettingsSection(db, request, "oauth");
      const result = await applications.save(
        parseId(request.params.id),
        parseApplication(request.body),
        user.id,
      );
      return reply.header("Cache-Control", "no-store").send({ data: result });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/oauth-apps/:id/secret",
    admin,
    async (request, reply) => {
      const user = await requireSettingsSection(db, request, "oauth");
      return reply.header("Cache-Control", "no-store").send({
        data: {
          clientSecret: await applications.rotateSecret(
            parseId(request.params.id),
            user.id,
          ),
        },
      });
    },
  );
  registerOAuthInteractions(app, db, provider, applications, consents);
  registerOAuthConsentRoutes(app, db, consents);
  app.register(async (scope) => {
    scope.addHook("onRequest", credentialRateLimit(180));
    await scope.register(middie);
    // Authorization query strings and one-time resume identifiers must not enter access logs.
    scope.all("/oauth/*", { logLevel: "silent" }, async (_request, reply) =>
      reply.code(404).send(),
    );
    scope.use("/oauth", (request, response, next) => {
      // The advertised issuer is configured, never derived from caller-supplied forwarded headers.
      const issuer = new URL(config.issuer);
      request.headers.host = issuer.host;
      request.headers["x-forwarded-proto"] = issuer.protocol.slice(0, -1);
      request.headers["x-forwarded-host"] = issuer.host;
      delete request.headers["x-forwarded-for"];
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Frame-Options", "DENY");
      void provider.callback()(request, response).catch(next);
    });
  });
  let cleanup: ReturnType<typeof setInterval> | undefined;
  const prune = async () => {
    try {
      await db("public.asmblyr_oauth_state")
        .where("expires_at", "<", db.fn.now())
        .delete();
      await db("public.asmblyr_oauth_grants")
        .where("expires_at", "<", db.fn.now())
        .delete();
    } catch {
      app.log.warn("OAuth state cleanup failed");
    }
  };
  app.addHook("onReady", async () => {
    await prune();
    cleanup = setInterval(
      () => {
        void prune();
      },
      60 * 60 * 1000,
    );
    cleanup.unref();
  });
  app.addHook("onClose", async () => {
    if (cleanup) {
      clearInterval(cleanup);
    }
  });
}
