import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess, requireHuman } from "../permissions/access.js";
import { objectInput } from "../shared/input.js";
import { integrationError } from "../integrations/types.js";
import { credentialRateLimit } from "../auth/rate-limit.js";
import type { GoogleConnections } from "./google/connections.js";
import { startGoogleFlow, finishGoogleFlow } from "./google/flows.js";
import { GoogleWrites } from "./google/writes.js";

export function registerConnectionRoutes(
  app: FastifyInstance,
  database: Knex | null,
  google: GoogleConnections | null,
) {
  const authorize = async (authorization?: string) => {
    if (!database) {
      throw integrationError("connection_disabled", 503);
    }
    const access = await loadAccess(database, authorization);
    requireHuman(access);
    if (!google) {
      throw integrationError("connection_disabled", 503);
    }
    return access;
  };
  const writes = google ? new GoogleWrites(google) : null;
  app.get("/connections/google", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await authorize(request.headers.authorization);
    return { data: await google!.status(access.principal.id) };
  });
  app.post(
    "/connections/google/start",
    { preHandler: credentialRateLimit(12) },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      objectInput(request.body, []);
      return { data: await startGoogleFlow(google!, access.principal.id) };
    },
  );
  app.post(
    "/connections/google/callback",
    { bodyLimit: 16000, preHandler: credentialRateLimit(12) },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return {
        data: await finishGoogleFlow(google!, access, request.body, () =>
          authorize(request.headers.authorization),
        ),
      };
    },
  );
  app.delete("/connections/google", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await authorize(request.headers.authorization);
    return { data: await google!.disconnect(access.principal.id) };
  });
  app.get<{ Params: { id: string } }>(
    "/connections/google/writes/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return {
        data: await writes!.get(access.principal.id, request.params.id),
      };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/connections/google/writes/:id/confirm",
    { preHandler: credentialRateLimit(20) },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      objectInput(request.body, []);
      return {
        data: await writes!.confirm(access.principal.id, request.params.id),
      };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/connections/google/writes/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return {
        data: await writes!.cancel(access.principal.id, request.params.id),
      };
    },
  );
}
