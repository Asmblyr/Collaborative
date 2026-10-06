import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { listSystemCollections } from "./repository.js";
import { saveSystemField, deleteSystemField } from "./fields.js";
import {
  listSystemRecords,
  readSystemRecord,
  updateSystemRecord,
} from "./records.js";

export function registerSystemCollectionRoutes(
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
  const admin = {
    preHandler: async (request: Parameters<typeof requireSuperuser>[1]) => {
      await requireSuperuser(db(), request);
    },
  };
  app.get("/system-collections", admin, async (_request, reply) => {
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await listSystemCollections(db()) });
  });
  app.post<{ Params: { name: string; field: string } }>(
    "/system-collections/:name/fields/:field/configuration",
    admin,
    async (request, reply) => {
      const data = await saveSystemField(
        db(),
        request.params.name,
        request.params.field,
        request.body,
        true,
      );
      return reply.code(201).send({ data });
    },
  );
  app.put<{ Params: { name: string; field: string } }>(
    "/system-collections/:name/fields/:field/configuration",
    admin,
    async (request) => {
      return {
        data: await saveSystemField(
          db(),
          request.params.name,
          request.params.field,
          request.body,
          false,
        ),
      };
    },
  );
  app.delete<{ Params: { name: string; field: string } }>(
    "/system-collections/:name/fields/:field",
    admin,
    async (request, reply) => {
      await deleteSystemField(db(), request.params.name, request.params.field);
      return reply.code(204).send();
    },
  );
  app.get<{ Params: { name: string } }>(
    "/system-collections/:name/records",
    admin,
    async (request, reply) => {
      return reply.header("Cache-Control", "no-store").send({
        data: await listSystemRecords(db(), request.params.name, request.query),
      });
    },
  );
  app.get<{ Params: { name: string; id: string } }>(
    "/system-collections/:name/records/:id",
    admin,
    async (request, reply) => {
      return reply.header("Cache-Control", "no-store").send({
        data: await readSystemRecord(
          db(),
          request.params.name,
          request.params.id,
        ),
      });
    },
  );
  app.patch<{ Params: { name: string; id: string } }>(
    "/system-collections/:name/records/:id",
    admin,
    async (request, reply) => {
      const actor = await requireSuperuser(db(), request);
      const data = await updateSystemRecord(
        db(),
        request.params.name,
        request.params.id,
        request.body,
        actor.id,
      );
      return reply.header("Cache-Control", "no-store").send({ data });
    },
  );
}
