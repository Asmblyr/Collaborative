import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import { inviteUser, listUsers, renewInvitation } from "./invitations.js";
import { getUserAccess } from "./user-access.js";
import { parseInvite, parseUserId } from "./validation.js";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import { replaceUserDelegation } from "../policies/delegation-repository.js";
import { parsePolicyIds } from "../policies/assignment-validation.js";
import { createRecoveryLink } from "./link-login.js";
import { authenticateAccess } from "./tokens.js";

export function registerUserRoutes(
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
  const admin = {
    preHandler: (request: Parameters<typeof requireSettingsSection>[1]) =>
      requireSettingsSection(db(), request, "users"),
  };

  const reader = {
    preHandler: (request: Parameters<typeof requireSettingsSection>[1]) =>
      requireSettingsRead(db(), request, "users", "policies"),
  };

  app.get("/users", reader, async (_request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .send({ data: await listUsers(db()) }),
  );
  app.post("/users", admin, async (request, reply) =>
    reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({ data: await inviteUser(db(), parseInvite(request.body)) }),
  );
  app.post<{ Params: { id: string } }>(
    "/users/:id/recovery",
    {
      preHandler: (request) => requireSettingsAdministrator(db(), request),
    },
    async (request, reply) => {
      const actor = await authenticateAccess(
        db(),
        request.headers.authorization,
      );
      return reply.header("Cache-Control", "no-store").send({
        data: await createRecoveryLink(
          db(),
          actor,
          parseUserId(request.params.id),
        ),
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/users/:id/access",
    { preHandler: (request) => requireSettingsRead(db(), request, "users") },
    async (request, reply) =>
      reply.header("Cache-Control", "no-store").send({
        data: await getUserAccess(db(), parseUserId(request.params.id)),
      }),
  );
  app.post<{ Params: { id: string } }>(
    "/users/:id/invitation",
    admin,
    async (request, reply) => {
      const actor = await requireSettingsSection(db(), request, "users");
      return reply.header("Cache-Control", "no-store").send({
        data: await renewInvitation(
          db(),
          parseUserId(request.params.id),
          actor.id,
        ),
      });
    },
  );
  app.put<{ Params: { id: string } }>(
    "/users/:id/delegation",
    {
      preHandler: (request) => requireSettingsAdministrator(db(), request),
    },
    async (request, reply) => {
      const policyIds = await replaceUserDelegation(
        db(),
        parseUserId(request.params.id),
        parsePolicyIds(request.body, "policyIds"),
        request.headers.authorization,
      );
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: { policyIds } });
    },
  );
}
