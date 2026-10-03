import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSettingsSection } from "../settings/access.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import { parseId } from "../policies/validation.js";
import { createFederation, revokeFederation } from "./federation-repository.js";
import { exchangeFederation } from "./federation-exchange.js";

export function registerFederationRoutes(
  app: FastifyInstance,
  database: Knex | null,
) {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.post(
    "/auth/federation-token",
    { preHandler: credentialRateLimit(60), bodyLimit: 18000 },
    async (request, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .send(await exchangeFederation(db(), request.body)),
  );
  app.post<{ Params: { id: string } }>(
    "/service-accounts/:id/federations",
    async (request, reply) => {
      const user = await requireSettingsSection(db(), request, "services");
      return reply
        .header("Cache-Control", "no-store")
        .code(201)
        .send({
          data: await createFederation(
            db(),
            parseId(request.params.id),
            request.body,
            user.id,
          ),
        });
    },
  );
  app.delete<{ Params: { id: string; federationId: string } }>(
    "/service-accounts/:id/federations/:federationId",
    async (request, reply) => {
      const user = await requireSettingsSection(db(), request, "services");
      await revokeFederation(
        db(),
        parseId(request.params.id),
        parseId(request.params.federationId),
        user.id,
      );
      return reply.code(204).send();
    },
  );
}
