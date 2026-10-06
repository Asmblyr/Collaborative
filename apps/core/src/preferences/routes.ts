import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { authenticateAccess } from "../auth/tokens.js";
import { loadAccess } from "../permissions/access.js";
import { readAppearance, saveAppearance } from "./appearance.js";
import {
  getTablePreferences,
  saveTablePreferences,
} from "./table-preferences.js";

export function registerPreferenceRoutes(
  app: FastifyInstance,
  database: Knex | null,
) {
  function db(): Knex {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    return database;
  }
  app.get("/users/me/preferences", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await readAppearance(db(), user.id) });
  });
  app.patch("/users/me/preferences", async (request, reply) => {
    const user = await authenticateAccess(db(), request.headers.authorization);
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await saveAppearance(db(), user.id, request.body) });
  });
  app.get<{ Params: { collection: string } }>(
    "/users/me/table-preferences/:collection",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return reply.header("Cache-Control", "no-store").send({
        data: await getTablePreferences(
          db(),
          request.params.collection,
          access,
        ),
      });
    },
  );
  app.patch<{ Params: { collection: string } }>(
    "/users/me/table-preferences/:collection",
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      return reply.header("Cache-Control", "no-store").send({
        data: await saveTablePreferences(
          db(),
          request.params.collection,
          access,
          request.body,
        ),
      });
    },
  );
}
