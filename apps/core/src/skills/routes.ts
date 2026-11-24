import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { GoogleConnections } from "../connections/google/connections.js";
import {
  AccessDeniedError,
  loadAccess,
  requireHuman,
} from "../permissions/access.js";
import {
  requireSettingsRead,
  requireSettingsSection,
} from "../settings/access.js";
import { deleteSkill, listAdminSkills, saveSkill } from "./repository.js";
import {
  parseSkillCatalogQuery,
  parseSkillId,
  parseSkillInput,
} from "./validation.js";
import { listVisibleSkills } from "./visibility.js";

export function registerSkillRoutes(
  app: FastifyInstance,
  database: Knex | null,
  google: GoogleConnections | null = null,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }

  async function authorizeAssistantUser(authorization?: string) {
    const access = await loadAccess(db(), authorization);
    requireHuman(access);
    if (
      !access.principal.superuser &&
      !(google && (await google.available(access.principal.id))) &&
      ![...access.grants.keys()].some((key) =>
        /:(read|create|update)$/.test(key),
      )
    ) {
      throw new AccessDeniedError();
    }
    return access;
  }

  app.get("/settings/skills", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const user = await requireSettingsRead(db(), request, "skills");
    return listAdminSkills(db(), user.id);
  });

  app.post(
    "/settings/skills",
    { bodyLimit: 64_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const user = await requireSettingsSection(db(), request, "skills");
      const input = parseSkillInput(request.body);
      return reply
        .code(201)
        .send({ data: await saveSkill(db(), input, user.id) });
    },
  );

  app.put<{ Params: { id: string } }>(
    "/settings/skills/:id",
    { bodyLimit: 64_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const user = await requireSettingsSection(db(), request, "skills");
      const id = parseSkillId(request.params.id);
      const input = parseSkillInput(request.body);
      return { data: await saveSkill(db(), input, user.id, id) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/settings/skills/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const user = await requireSettingsSection(db(), request, "skills");
      const id = parseSkillId(request.params.id);
      await deleteSkill(db(), id, user.id);
      return reply.code(204).send();
    },
  );

  app.get("/assistant/skills", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await authorizeAssistantUser(request.headers.authorization);
    const query = parseSkillCatalogQuery(request.query);
    return {
      data: await listVisibleSkills(db(), access, {
        channel: "assistant",
        collection: query.collection,
        workspaceId: query.workspaceId,
        q: query.q,
        limit: query.limit,
      }),
    };
  });
}
