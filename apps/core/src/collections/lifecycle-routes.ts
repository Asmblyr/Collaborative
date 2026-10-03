import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { loadAccess, type Access } from "../permissions/access.js";
import {
  collectionDeleteImpact,
  fieldDeleteImpact,
  deleteCollectionField,
  deleteCollection,
} from "./lifecycle-service.js";

export type CollectionDeletedHandler = (
  transaction: Knex.Transaction,
  access: Access,
  requestId: string,
  target: { collection: string; collectionId: string },
) => Promise<void>;

export function registerCollectionLifecycleRoutes(
  app: FastifyInstance,
  database: Knex | null,
  onDeleted?: CollectionDeletedHandler,
): void {
  const admin = {
    preHandler: (request: Parameters<typeof requireSuperuser>[1]) => {
      if (!database) {
        throw Object.assign(new Error("Database is not configured"), {
          statusCode: 503,
        });
      }
      return requireSuperuser(database, request);
    },
  };
  app.get<{ Params: { name: string } }>(
    "/collections/:name/impact",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      return {
        data: await collectionDeleteImpact(database, request.params.name),
      };
    },
  );

  app.get<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field/impact",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      return {
        data: await fieldDeleteImpact(
          database,
          request.params.name,
          request.params.field,
        ),
      };
    },
  );

  app.delete<{ Params: { name: string; field: string } }>(
    "/collections/:name/fields/:field",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      await deleteCollectionField(
        database,
        request.params.name,
        request.params.field,
      );
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { name: string } }>(
    "/collections/:name",
    admin,
    async (request, reply) => {
      if (!database) {
        return reply.code(503).send({ message: "Database is not configured" });
      }
      const access = await loadAccess(database, request.headers.authorization);
      await deleteCollection(
        database,
        request.params.name,
        (transaction, target) =>
          onDeleted?.(transaction, access, request.id, target) ??
          Promise.resolve(),
      );
      return reply.code(204).send();
    },
  );
}
