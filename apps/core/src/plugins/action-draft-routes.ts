import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import type { PluginActions } from "./actions.js";

export function registerPluginDraftRoutes(
  app: FastifyInstance,
  db: Knex | null,
  actions: PluginActions,
) {
  async function access(authorization?: string) {
    if (!db)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    return loadAccess(db, authorization);
  }
  app.get<{ Params: { namespace: string; id: string } }>(
    "/extensions/:namespace/drafts/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return {
        data: actions.prepared(
          await access(request.headers.authorization),
          request.params.namespace,
          request.params.id,
        ),
      };
    },
  );
}
