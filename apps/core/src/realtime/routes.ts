import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";
import { acquireLock, parseLockInput, releaseLock } from "./locks.js";
import type { RealtimeBus } from "./bus.js";
import { registerRealtimeStream } from "./stream.js";

export function registerRealtimeRoutes(
  app: FastifyInstance,
  database: Knex | null,
  bus: RealtimeBus,
): void {
  function db(): Knex {
    if (!database) {
      throw new ItemError("Database is not configured", 503);
    }
    return database;
  }

  app.post("/realtime/locks", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await loadAccess(db(), request.headers.authorization);
    return acquireLock(db(), access, parseLockInput(request.body));
  });
  app.delete("/realtime/locks", async (request, reply) => {
    const access = await loadAccess(db(), request.headers.authorization);
    await releaseLock(db(), access, parseLockInput(request.body));
    return reply.header("Cache-Control", "no-store").code(204).send();
  });

  registerRealtimeStream(app, database, bus);
}
