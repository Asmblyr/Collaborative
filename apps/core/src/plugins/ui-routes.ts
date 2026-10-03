import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import type { LoadedPlugin } from "./definition.js";

export function registerPluginUiRoutes(
  app: FastifyInstance,
  database: Knex | null,
  plugins: readonly LoadedPlugin[],
): void {
  app.get("/extensions", async (request, reply) => {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    await loadAccess(database, request.headers.authorization);
    return reply.header("Cache-Control", "no-store").send({
      data: plugins
        .filter((plugin) => plugin.hasUi)
        .map((plugin) => ({ name: plugin.name, namespace: plugin.namespace })),
    });
  });
}
