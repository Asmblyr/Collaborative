import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "../tokens.js";
import { credentialRateLimit } from "../rate-limit.js";
import { parseCliAuthorization, parseCliExchange } from "./input.js";
import { authorizeCli, exchangeCli } from "./service.js";
export function registerCliRoutes(
  app: FastifyInstance,
  database: Knex | null,
  uiOrigin: string,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.get("/auth/cli/config", async (_request, reply) =>
    reply.header("cache-control", "no-store").send({
      data: { authorizationUrl: new URL("/sdk/connect", uiOrigin).href },
    }),
  );
  app.post(
    "/auth/cli/authorize",
    { preHandler: credentialRateLimit(30) },
    async (request, reply) => {
      const user = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      const redirectTo = await authorizeCli(
        db(),
        user,
        parseCliAuthorization(request.body),
      );
      return reply
        .header("cache-control", "no-store")
        .send({ data: { redirectTo } });
    },
  );
  app.post(
    "/auth/cli/token",
    { preHandler: credentialRateLimit(60) },
    async (request, reply) =>
      reply.header("cache-control", "no-store").send({
        data: await exchangeCli(db(), parseCliExchange(request.body)),
      }),
  );
}
