import { readdir } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

const migrationsDirectory = new URL("../../migrations/", import.meta.url);

async function hasRequiredMigrations(database: Knex): Promise<boolean> {
  const exists = await database.schema.withSchema("public").hasTable("asmblyr_migrations");
  if (!exists) return false;

  const required = (await readdir(migrationsDirectory)).filter((name) => name.endsWith(".cjs"));
  const applied = await database("asmblyr_migrations").withSchema("public").pluck<string[]>("name");
  const appliedNames = new Set(applied);
  return required.every((name) => appliedNames.has(name));
}

async function hasCollectionMetadata(database: Knex): Promise<boolean> {
  try {
    // Detect manual schema drift in the metadata every collection request reads.
    await database("asmblyr_collections")
      .withSchema("public")
      .select("display_name", "mcp_enabled", "mcp_description", "hidden", "parent_collection")
      .limit(0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "42703" || error.code === "42P01")
    ) {
      return false;
    }
    throw error;
  }
}

export function registerReadiness(app: FastifyInstance, database: Knex | null): void {
  app.get("/ready", async (_request, reply) => {
    if (!database) {
      return reply.code(503).send({ status: "not_ready", reason: "database_not_configured" });
    }

    try {
      const ready =
        (await hasRequiredMigrations(database)) && (await hasCollectionMetadata(database));
      if (!ready) {
        return reply.code(503).send({ status: "not_ready", reason: "migrations_pending" });
      }
      return { status: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({ status: "not_ready", reason: "database_unavailable" });
    }
  });
}
