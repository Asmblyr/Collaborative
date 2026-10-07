import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import { setPolicyUser, replacePolicyUsers } from "./assignment-repository.js";
import { parsePolicyIds } from "./assignment-validation.js";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import {
  createPolicyConfiguration,
  updatePolicyConfiguration,
} from "./configuration-repository.js";
import {
  hasPolicyConfiguration,
  parsePolicyConfiguration,
} from "./configuration-validation.js";
import {
  attachPermission,
  createPolicy,
  deletePolicy,
  detachPermission,
  getPolicy,
  listPolicies,
  renamePolicy,
} from "./repository.js";
import { parseId, parseName } from "./validation.js";
import { policyApplicationCatalog } from "../oauth/policy-access.js";

interface PolicyParams {
  id: string;
}
interface AssignmentParams extends PolicyParams {
  userId: string;
}
interface PermissionParams extends PolicyParams {
  permissionId: string;
}

export function registerPolicyRoutes(
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
    preHandler: (request: Parameters<typeof requireSettingsAdministrator>[1]) =>
      requireSettingsAdministrator(db(), request),
  };

  const reader = {
    preHandler: (request: Parameters<typeof requireSettingsRead>[1]) =>
      requireSettingsRead(db(), request, "policies"),
  };
  app.get("/policies", reader, async () => ({
    data: await listPolicies(db()),
  }));
  app.get("/policies/applications", reader, async () => ({
    data: await policyApplicationCatalog(db()),
  }));
  app.post("/policies", admin, async (request, reply) =>
    reply.code(201).send({
      data: hasPolicyConfiguration(request.body)
        ? await createPolicyConfiguration(
            db(),
            parsePolicyConfiguration(request.body),
          )
        : await createPolicy(db(), parseName(request.body)),
    }),
  );

  app.get<{ Params: PolicyParams }>(
    "/policies/:id",
    reader,
    async (request) => ({
      data: await getPolicy(db(), parseId(request.params.id)),
    }),
  );
  app.patch<{ Params: PolicyParams }>(
    "/policies/:id",
    admin,
    async (request) => ({
      data: hasPolicyConfiguration(request.body)
        ? await updatePolicyConfiguration(
            db(),
            parseId(request.params.id),
            parsePolicyConfiguration(request.body),
          )
        : await renamePolicy(
            db(),
            parseId(request.params.id),
            parseName(request.body),
          ),
    }),
  );
  app.delete<{ Params: PolicyParams }>(
    "/policies/:id",
    admin,
    async (request, reply) => {
      await deletePolicy(db(), parseId(request.params.id));
      return reply.code(204).send();
    },
  );

  app.put<{ Params: PermissionParams }>(
    "/policies/:id/permissions/:permissionId",
    admin,
    async (request, reply) => {
      await attachPermission(
        db(),
        parseId(request.params.id),
        parseId(request.params.permissionId),
      );
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: PermissionParams }>(
    "/policies/:id/permissions/:permissionId",
    admin,
    async (request, reply) => {
      await detachPermission(
        db(),
        parseId(request.params.id),
        parseId(request.params.permissionId),
      );
      return reply.code(204).send();
    },
  );

  app.put<{ Params: AssignmentParams }>(
    "/policies/:id/users/:userId",
    async (request, reply) => {
      const actor = await requireSettingsSection(db(), request, "policies");
      await setPolicyUser(
        db(),
        parseId(request.params.id),
        parseId(request.params.userId),
        actor.id,
        true,
      );
      return reply.code(204).send();
    },
  );
  app.delete<{ Params: AssignmentParams }>(
    "/policies/:id/users/:userId",
    async (request, reply) => {
      const actor = await requireSettingsSection(db(), request, "policies");
      await setPolicyUser(
        db(),
        parseId(request.params.id),
        parseId(request.params.userId),
        actor.id,
        false,
      );
      return reply.code(204).send();
    },
  );
  app.put<{ Params: PolicyParams }>(
    "/policies/:id/users",
    async (request, reply) => {
      const actor = await requireSettingsSection(db(), request, "policies");
      await replacePolicyUsers(
        db(),
        parseId(request.params.id),
        parsePolicyIds(request.body, "userIds"),
        actor.id,
      );
      return reply.code(204).send();
    },
  );
}
