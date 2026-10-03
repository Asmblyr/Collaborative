import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  AccessDeniedError,
  loadAccess,
  requireHuman,
} from "../permissions/access.js";
import { listTerms, saveTerm } from "./repository.js";
import { parseTermId, parseTermInput } from "./validation.js";
import {
  listBindings,
  removeBinding,
  replaceBindings,
  saveBinding,
} from "./bindings.js";

export function registerTermRoutes(
  app: FastifyInstance,
  database: Knex | null,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  async function authorize(authorization?: string) {
    const access = await loadAccess(db(), authorization);
    requireHuman(access);
    if (!access.principal.superuser) {
      throw new AccessDeniedError();
    }
    return access;
  }
  app.get("/settings/terms", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "terms");
    return { data: await listTerms(db()) };
  });
  app.post("/settings/terms", { bodyLimit: 16_000 }, async (request, reply) => {
    await requireSettingsSection(db(), request, "terms");
    return reply
      .code(201)
      .send({ data: await saveTerm(db(), parseTermInput(request.body)) });
  });
  app.put<{ Params: { id: string } }>(
    "/settings/terms/:id",
    { bodyLimit: 16_000 },
    async (request) => {
      await requireSettingsSection(db(), request, "terms");
      return {
        data: await saveTerm(
          db(),
          parseTermInput(request.body),
          parseTermId(request.params.id),
        ),
      };
    },
  );
  app.get<{ Params: { name: string } }>(
    "/collections/:name/terms",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return { data: await listBindings(db(), request.params.name, access) };
    },
  );
  app.put<{ Params: { name: string; id: string } }>(
    "/collections/:name/terms/:id",
    { bodyLimit: 16_000 },
    async (request, reply) => {
      const access = await authorize(request.headers.authorization);
      await saveBinding(
        db(),
        request.params.name,
        request.params.id,
        request.body,
        access,
      );
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: { name: string; id: string } }>(
    "/collections/:name/terms/:id",
    async (request, reply) => {
      await authorize(request.headers.authorization);
      await removeBinding(db(), request.params.name, request.params.id);
      return reply.code(204).send();
    },
  );
  app.put<{ Params: { name: string } }>(
    "/collections/:name/terms",
    { bodyLimit: 180_000 },
    async (request, reply) => {
      const access = await authorize(request.headers.authorization);
      await replaceBindings(db(), request.params.name, request.body, access);
      return reply.code(204).send();
    },
  );
}
