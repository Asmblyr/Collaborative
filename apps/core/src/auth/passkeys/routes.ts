import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "../tokens.js";
import { credentialRateLimit } from "../rate-limit.js";
import type { PasskeyConfig } from "./config.js";
import type { SsoProvider } from "../sso/config.js";
import {
  authenticationOptions,
  registrationOptions,
  listPasskeys,
  loginPasskey,
  registerPasskey,
  removePasskey,
} from "./service.js";

export function registerPasskeyRoutes(
  app: FastifyInstance,
  database: Knex | null,
  config: PasskeyConfig,
  providers: SsoProvider[] = [],
): void {
  const db = () => {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  };
  app.register(async (scope) => {
    scope.addHook("onRequest", async (_request, reply) => {
      reply.header("Cache-Control", "no-store");
    });
    scope.post(
      "/auth/passkeys/options",
      { preHandler: credentialRateLimit(30) },
      async () => authenticationOptions(db(), config),
    );
    scope.post(
      "/auth/passkeys/login",
      { preHandler: credentialRateLimit(30) },
      async (request) =>
        loginPasskey(db(), config, request.body, request.headers["user-agent"]),
    );
    scope.get("/users/me/passkeys", async (request) => ({
      data: await listPasskeys(
        db(),
        (await authenticateAccess(db(), request.headers.authorization)).id,
      ),
    }));
    scope.post(
      "/users/me/passkeys/options",
      { preHandler: credentialRateLimit(10) },
      async (request) =>
        registrationOptions(
          db(),
          config,
          await authenticateAccess(db(), request.headers.authorization),
        ),
    );
    scope.post(
      "/users/me/passkeys",
      { preHandler: credentialRateLimit(10) },
      async (request, reply) =>
        reply.code(201).send({
          data: await registerPasskey(
            db(),
            config,
            await authenticateAccess(db(), request.headers.authorization),
            request.body,
          ),
        }),
    );
    scope.delete<{ Params: { id: string } }>(
      "/users/me/passkeys/:id",
      async (request, reply) => {
        await removePasskey(
          db(),
          await authenticateAccess(db(), request.headers.authorization),
          request.params.id,
          providers,
        );
        return reply.code(204).send();
      },
    );
  });
}
