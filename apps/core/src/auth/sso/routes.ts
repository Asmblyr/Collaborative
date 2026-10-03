import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { credentialRateLimit } from "../rate-limit.js";
import { authenticateAccess } from "../tokens.js";
import { parseUserId } from "../validation.js";
import { listIdentities, unlinkIdentity } from "./identities.js";
import { parseSsoCallback, parseSsoStart } from "./input.js";
import { SsoService } from "./service.js";

export function registerSsoRoutes(
  app: FastifyInstance,
  database: Knex | null,
  sso: SsoService,
): void {
  function db(): Knex {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    return database;
  }
  app.get("/auth/providers", async (_request, reply) =>
    reply.header("Cache-Control", "no-store").send({
      data: sso.providers.map(({ id, label, driver }) => ({
        id,
        label,
        driver,
      })),
    }),
  );
  app.post<{ Params: { provider: string } }>(
    "/auth/sso/:provider/start",
    { preHandler: credentialRateLimit(60) },
    async (request) =>
      sso.start(
        db(),
        request.params.provider,
        parseSsoStart(request.body),
        request.headers.authorization,
      ),
  );
  app.post<{ Params: { provider: string } }>(
    "/auth/sso/:provider/callback",
    { preHandler: credentialRateLimit(120) },
    async (request) =>
      sso.complete(
        db(),
        request.params.provider,
        parseSsoCallback(request.body),
        request.headers.authorization,
        request.headers["user-agent"],
      ),
  );
  app.get("/users/me/identities", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply.header("Cache-Control", "no-store").send({
      data: await listIdentities(db(), user.id, sso.providers),
    });
  });
  app.delete<{ Params: { id: string } }>(
    "/users/me/identities/:id",
    async (request, reply) => {
      const user = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      await unlinkIdentity(
        db(),
        user.id,
        parseUserId(request.params.id),
        sso.providers,
      );
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
}
