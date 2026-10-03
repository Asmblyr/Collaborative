import { listCollections } from "../collections/catalog-repository.js";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
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
        ({ name, displayName, fields, primaryKey, timestamps, state }) => ({
          name,
          displayName,
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
    await requireSettingsRead(db(), request, "users", "policies", "services");
    return {
      data: await db()("public.asmblyr_policies")
        .select("id", "name")
        .orderBy("name"),
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
