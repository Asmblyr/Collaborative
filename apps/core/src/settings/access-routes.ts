import { listCollections } from "../collections/catalog-repository.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { AccessDeniedError } from "../permissions/access.js";
import { loadSettingsAccess, requireSettingsRead } from "./access.js";

export function registerSettingsAccessRoutes(
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

  app.get("/settings/access", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const {
      sections,
      editableSections,
      canManagePolicies,
      delegatablePolicyIds,
    } = await loadSettingsAccess(db(), request.headers.authorization);
    return {
      data: {
        sections,
        editableSections,
        canManagePolicies,
        delegatablePolicyIds,
      },
    };
  });

  app.get("/settings/options/collections", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "policies");
    const collections = await listCollections(db());
    return {
      data: collections.map(
        ({
          name,
          displayName,
          translations,
          fields,
          primaryKey,
          timestamps,
          state,
        }) => ({
          name,
          displayName,
          translations,
          fields: fields.map(
            ({ name, type, nullable, presentation, relation }) => ({
              name,
              type,
              nullable,
              presentation,
              relation,
            }),
          ),
          state,
          primaryKey,
          timestamps,
        }),
      ),
    };
  });

  // Selectors need only IDs and labels, not access to another administration section.
  app.get("/settings/options/policies", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const access = await loadSettingsAccess(
      db(),
      request.headers.authorization,
    );
    if (
      !(["users", "policies", "services", "skills"] as const).some((section) =>
        access.sections.includes(section),
      )
    ) {
      throw new AccessDeniedError();
    }
    const query = db()("public.asmblyr_policies")
      .select<{ id: string; name: string }[]>("id", "name")
      .orderBy("name");
    const delegatableOnly =
      request.query !== null &&
      typeof request.query === "object" &&
      "delegatable" in request.query &&
      ((request.query as Record<string, unknown>).delegatable === "1" ||
        (request.query as Record<string, unknown>).delegatable === "true");
    if (delegatableOnly && !access.user.superuser) {
      query.whereIn("id", access.delegatablePolicyIds);
    }
    return {
      data: await query,
      delegatablePolicyIds: access.user.superuser
        ? null
        : access.delegatablePolicyIds,
    };
  });

  app.get("/settings/options/users", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "oauth");
    return {
      data: await db()("public.asmblyr_users")
        .select("id", "email")
        .orderBy("email"),
    };
  });
}
