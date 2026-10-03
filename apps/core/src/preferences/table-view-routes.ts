import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import { listTableViews, saveTableView, deleteTableView, defaultTableView } from "./table-view-service.js";

export function registerTableViewRoutes(app: FastifyInstance, database: Knex | null) {
  const db = () => { if (!database) throw Object.assign(new Error("Database is not configured"), { statusCode: 503 }); return database; };
  app.get<{ Params: { collection: string } }>("/table-views/:collection/default", async (req) => ({
    data: await defaultTableView(db(), req.params.collection, await loadAccess(db(), req.headers.authorization)),
  }));
  app.get<{ Params: { collection: string } }>("/table-views/:collection", async (req) => ({
    data: await listTableViews(db(), req.params.collection, await loadAccess(db(), req.headers.authorization)),
  }));
  app.post<{ Params: { collection: string } }>("/table-views/:collection", async (req, reply) => reply.code(201).send({
    data: await saveTableView(db(), req.params.collection, await loadAccess(db(), req.headers.authorization), req.body),
  }));
  app.put<{ Params: { collection: string; id: string } }>("/table-views/:collection/:id", async (req) => ({
    data: await saveTableView(db(), req.params.collection, await loadAccess(db(), req.headers.authorization), req.body, req.params.id),
  }));
  app.delete<{ Params: { collection: string; id: string } }>("/table-views/:collection/:id", async (req, reply) => {
    await deleteTableView(db(), req.params.collection, await loadAccess(db(), req.headers.authorization), req.params.id);
    return reply.code(204).send();
  });
}
