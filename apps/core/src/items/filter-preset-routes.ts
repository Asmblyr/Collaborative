import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import { createFilterPreset, deleteFilterPreset, listFilterPresets,
  updateFilterPreset } from "./filter-preset-service.js";

interface CollectionParams { collection: string }
interface PresetParams extends CollectionParams { id: string }

export function registerFilterPresetRoutes(app: FastifyInstance, database: Knex | null): void {
  function db(): Knex {
    if (!database) throw Object.assign(new Error("Database is not configured"), { statusCode: 503 });
    return database;
  }

  app.get<{ Params: CollectionParams }>("/filter-presets/:collection", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    return { data: await listFilterPresets(db(), request.params.collection, access) };
  });
  app.post<{ Params: CollectionParams }>("/filter-presets/:collection", async (request, reply) => {
    const access = await loadAccess(db(), request.headers.authorization);
    return reply.code(201).send({ data: await createFilterPreset(db(), request.params.collection,
      request.body, access) });
  });
  app.put<{ Params: PresetParams }>("/filter-presets/:collection/:id", async (request) => {
    const access = await loadAccess(db(), request.headers.authorization);
    return { data: await updateFilterPreset(db(), request.params.collection,
      request.params.id, request.body, access) };
  });
  app.delete<{ Params: PresetParams }>("/filter-presets/:collection/:id", async (request, reply) => {
    const access = await loadAccess(db(), request.headers.authorization);
    await deleteFilterPreset(db(), request.params.collection, request.params.id, access);
    return reply.code(204).send();
  });
}
