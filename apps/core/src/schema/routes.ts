import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import type { SchemaResult } from "@asmblyr-collaborative/contracts";
import { loadPrincipalAccess } from "../permissions/access.js";
import { authenticateSchemaPrincipal } from "../auth/cli/service.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { verifyMaterializedSource } from "../collections/materialized-repository.js";
import { listCollections } from "../collections/catalog-repository.js";
import { projectSchema } from "./projection.js";
import { AuthInputError } from "../auth/validation.js";
import type { PluginActions } from "../plugins/actions.js";

export function registerSchemaRoutes(
  app: FastifyInstance,
  db: Knex | null,
  actions?: PluginActions,
): void {
  app.get("/schema", async (request, reply): Promise<SchemaResult> => {
    if (!db) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    const access = await loadPrincipalAccess(
      db,
      await authenticateSchemaPrincipal(db, request.headers.authorization),
    );
    if (Object.keys(request.query as object).length) {
      throw new AuthInputError(
        "Schema export does not accept query parameters",
      );
    }
    reply.header("cache-control", "private, no-store");
    const data = projectSchema(
      await listCollections(db),
      access,
      actions?.consumerDefinitions(access),
    );
    for (const collection of data.collections) {
      if (collection.sourceKind !== "materialized-view") {
        continue;
      }
      const settings = await findCollectionSettings(db, collection.name);
      await verifyMaterializedSource(
        db,
        collection.name,
        settings?.sourceSchemaHash,
        collection.primaryKey,
        false,
      );
    }
    return { data };
  });
}
