import { parseRowFilter } from "./row-filter.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSettingsRead } from "../settings/access.js";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import { authenticatePrincipal } from "../auth/principal.js";
import { parseId } from "../policies/validation.js";
import {
  createPermission,
  deletePermission,
  effectivePermissions,
  getPermission,
  listPermissions,
  updatePermission,
} from "./repository.js";
import {
  parseCreatePermission,
  parsePolicyFilter,
  parseUpdatePermission,
} from "./validation.js";

interface PermissionParams {
  id: string;
}

export function registerPermissionRoutes(
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

  app.get("/permissions/me", async (request) => {
    const user = await authenticatePrincipal(
      db(),
      request.headers.authorization,
    );
    return {
      data: {
        superuser: user.superuser,
        permissions: user.superuser
          ? []
          : await effectivePermissions(db(), user.id, user.kind),
      },
    };
  });

  app.get("/permissions", reader, async (request) => ({
    data: await listPermissions(db(), parsePolicyFilter(request.query)),
  }));
  app.post("/permissions", admin, async (request, reply) =>
    reply.code(201).send({
      data: await createPermission(db(), parseCreatePermission(request.body)),
    }),
  );

  app.get<{ Params: PermissionParams }>(
    "/permissions/:id",
    reader,
    async (request) => ({
      data: await getPermission(db(), parseId(request.params.id)),
    }),
  );
  app.patch<{ Params: PermissionParams }>(
    "/permissions/:id",
    admin,
    async (request) => {
      const id = parseId(request.params.id);
      const current = await getPermission(db(), id);
      return {
        data: await updatePermission(
          db(),
          id,
          parseUpdatePermission(request.body, current.action),
          request.body &&
            typeof request.body === "object" &&
            "rowFilter" in request.body
            ? parseRowFilter(request.body.rowFilter)
            : undefined,
        ),
      };
    },
  );
  app.delete<{ Params: PermissionParams }>(
    "/permissions/:id",
    admin,
    async (request, reply) => {
      await deletePermission(db(), parseId(request.params.id));
      return reply.code(204).send();
    },
  );
}
