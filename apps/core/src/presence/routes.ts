import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { AccessDeniedError, loadAccess } from "../permissions/access.js";
import { parsePresenceClient, parsePresenceInput } from "./input.js";
import { presenceKey } from "./access.js";
import { touchPresence, leavePresence } from "./repository.js";

export function registerPresenceRoutes(
  app: FastifyInstance,
  database: Knex | null,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  app.post("/presence", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await loadAccess(db(), request.headers.authorization);
    if (access.principal.kind !== "user") {
      throw new AccessDeniedError();
    }
    const input = parsePresenceInput(request.body);
    let key: string;
    try {
      key = await presenceKey(db(), access, input.scope);
    } catch (error) {
      await leavePresence(db(), access.principal.sessionId, input.clientId);
      throw error;
    }
    return touchPresence(db(), access.principal, input.clientId, key);
  });
  app.delete<{ Params: { clientId: string } }>(
    "/presence/:clientId",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      if (access.principal.kind !== "user") {
        throw new AccessDeniedError();
      }
      await leavePresence(
        db(),
        access.principal.sessionId,
        parsePresenceClient(request.params.clientId),
      );
      return reply.header("Cache-Control", "no-store").code(204).send();
    },
  );
}
