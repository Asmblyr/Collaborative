import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { loadAccess } from "../permissions/access.js";
import type { CollectionDeletedHandler } from "./lifecycle-routes.js";
import {
  connectMaterializedView,
  disconnectMaterializedView,
  listMaterializedViews,
} from "./materialized-service.js";

export function registerMaterializedRoutes(
  app: FastifyInstance,
  database: Knex | null,
  onDeleted?: CollectionDeletedHandler,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  const admin = {
    preHandler: (request: Parameters<typeof requireSuperuser>[1]) =>
      requireSuperuser(db(), request),
  };
  app.get("/materialized-views", admin, async (_request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    return { data: await listMaterializedViews(db()) };
  });
  app.post("/materialized-views", admin, async (request, reply) =>
    reply
      .code(201)
      .send({ data: await connectMaterializedView(db(), request.body) }),
  );
  app.delete<{ Params: { name: string } }>(
    "/collections/:name/materialized-view",
    admin,
    async (request, reply) => {
      const access = await loadAccess(db(), request.headers.authorization);
      await disconnectMaterializedView(
        db(),
        request.params.name,
        onDeleted
          ? (transaction, target) =>
              onDeleted(transaction, access, request.id, target)
          : undefined,
      );
      return reply.code(204).send();
    },
  );
}
