import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  loadSettingsAccess,
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import { AccessDeniedError } from "../permissions/access.js";
import {
  inviteUser,
  inviteUsersBulk,
  listUsers,
  listUsersDirectory,
  renewInvitation,
} from "./invitations.js";
import { getUserAccess } from "./user-access.js";
import {
  parseBulkInviteInput,
  parseInviteInput,
  parseUserId,
  parseUsersListQuery,
  parseUserStatus,
} from "./validation.js";
import { setUserStatus } from "./user-status.js";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import { replaceUserDelegation } from "../policies/delegation-repository.js";
import { replaceUserPolicies } from "../policies/assignment-repository.js";
import { parsePolicyIds } from "../policies/assignment-validation.js";
import { createRecoveryLink } from "./link-login.js";
import { authenticateAccess } from "./tokens.js";
import { authenticatePrincipal } from "./principal.js";
import { listUserReferences } from "./user-references.js";

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

  app.get("/users/references", async (request, reply) => {
    const principal = await authenticatePrincipal(
      db(),
      request.headers.authorization,
    );
    return reply
      .header("Cache-Control", "no-store")
      .send(await listUserReferences(db(), principal, request.query));
  });

  const reader = {
    preHandler: (request: Parameters<typeof requireSettingsSection>[1]) =>
      requireSettingsRead(db(), request, "users", "policies"),
  };

  app.get("/users", reader, async (request, reply) => {
    const directoryQuery = parseUsersListQuery(request.query);
    if (directoryQuery) {
      return reply
        .header("Cache-Control", "no-store")
        .send(await listUsersDirectory(db(), directoryQuery));
    }
    return reply
      .header("Cache-Control", "no-store")
      .send({ data: await listUsers(db()) });
  });
  app.post("/users", async (request, reply) => {
    const actor = await requireSettingsSection(db(), request, "users");
    const { email, policyId } = parseInviteInput(request.body);
    return reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({
        data: await inviteUser(db(), email, { actorId: actor.id, policyId }),
      });
  });
  app.post("/invitations", async (request, reply) => {
    const actor = await requireSettingsSection(db(), request, "users");
    const body = request.body;
    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body) &&
      "emails" in body
    ) {
      const { emails, policyId } = parseBulkInviteInput(body);
      return reply
        .header("Cache-Control", "no-store")
        .code(201)
        .send({
          data: await inviteUsersBulk(db(), emails, {
            actorId: actor.id,
            policyId,
          }),
        });
    }
    const { email, policyId } = parseInviteInput(body);
    return reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({
        data: await inviteUser(db(), email, { actorId: actor.id, policyId }),
      });
  });
  app.post("/invitations/bulk", async (request, reply) => {
    const actor = await requireSettingsSection(db(), request, "users");
    const { emails, policyId } = parseBulkInviteInput(request.body);
    return reply
      .header("Cache-Control", "no-store")
      .code(201)
      .send({
        data: await inviteUsersBulk(db(), emails, {
          actorId: actor.id,
          policyId,
        }),
      });
  });
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
  app.patch<{ Params: { id: string } }>(
    "/users/:id/status",
    async (request, reply) => {
      const actor = await requireSettingsSection(db(), request, "users");
      return reply.header("Cache-Control", "no-store").send({
        data: await setUserStatus(
          db(),
          actor,
          parseUserId(request.params.id),
          parseUserStatus(request.body),
        ),
      });
    },
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
    "/users/:id/policies",
    async (request, reply) => {
      const access = await loadSettingsAccess(
        db(),
        request.headers.authorization,
      );
      if (
        !access.user.superuser &&
        (!access.editableSections.includes("policies") ||
          !access.sections.includes("users"))
      ) {
        throw new AccessDeniedError();
      }
      const policyIds = await replaceUserPolicies(
        db(),
        parseUserId(request.params.id),
        parsePolicyIds(request.body, "policyIds"),
        access.user.id,
      );
      return reply
        .header("Cache-Control", "no-store")
        .send({ data: { policyIds } });
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
