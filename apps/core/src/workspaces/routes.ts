import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { loadAccess } from "../permissions/access.js";
import { listWorkspaces, saveWorkspace, selectWorkspace, deleteWorkspace } from "./service.js";

export function registerWorkspaceRoutes(app: FastifyInstance, database: Knex | null) {
  const db = () => { if (!database) throw Object.assign(new Error("Database is not configured"), { statusCode: 503 }); return database; };
  app.get("/workspaces", async (req) => ({ data: await listWorkspaces(db(), await loadAccess(db(), req.headers.authorization)) }));
  app.post("/workspaces", async (req, reply) => reply.code(201).send({ data: await saveWorkspace(db(), await loadAccess(db(), req.headers.authorization), req.body) }));
  app.put<{ Params: { id: string } }>("/workspaces/:id", async (req) => ({ data: await saveWorkspace(db(), await loadAccess(db(), req.headers.authorization), req.body, req.params.id) }));
  app.delete<{ Params: { id: string } }>("/workspaces/:id", async (req, reply) => {
    await deleteWorkspace(db(), await loadAccess(db(), req.headers.authorization), req.params.id); return reply.code(204).send();
  });
  app.put("/users/me/workspace", async (req) => ({ data: await selectWorkspace(db(), await loadAccess(db(), req.headers.authorization), req.body) }));
}
