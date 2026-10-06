import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import type { IntegrationService } from "./service.js";
import { integrationError } from "./types.js";
import { sectionInput } from "./validation.js";

export function registerIntegrationRoutes(
  app: FastifyInstance,
  database: Knex | null,
  settings: IntegrationService | null,
  changed?: () => Promise<void> | undefined,
) {
  const db = () => {
    if (!database) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    return database;
  };
  const service = () => {
    if (!settings) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    return settings;
  };
  app.get("/settings/integrations", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSuperuser(db(), request);
    return { data: await service().snapshot() };
  });
  app.put<{ Params: { section: string } }>(
    "/settings/integrations/:section",
    { bodyLimit: 64000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const user = await requireSuperuser(db(), request);
      const data = await service().save(
        sectionInput(request.params.section),
        request.body,
        user.id,
      );
      await changed?.();
      return { data };
    },
  );
  app.post<{ Params: { section: string } }>(
    "/settings/integrations/:section/test",
    { bodyLimit: 64000, preHandler: credentialRateLimit(12) },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await requireSuperuser(db(), request);
      return {
        data: await service().check(
          sectionInput(request.params.section),
          request.body,
        ),
      };
    },
  );
}
