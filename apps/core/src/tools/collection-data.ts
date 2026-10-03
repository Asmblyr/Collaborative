import type { Knex } from "knex";
import { listCollections } from "../collections/catalog-repository.js";
import { collectionSchema } from "../items/schema-repository.js";
import { parseCollectionName, ItemError } from "../items/validation.js";
import { requireGrant, type Access } from "../permissions/access.js";
import { mcpCatalog, requireMcpCollection } from "./collection-scope.js";

export function toolCollectionName(value: unknown): string {
  if (typeof value !== "string" || value.startsWith("asmblyr_")) {
    throw new ItemError("Collection unavailable", 403);
  }
  return parseCollectionName(value);
}

export async function collectionData(db: Knex, access: Access, name: string) {
  toolCollectionName(name);
  const allowed = requireGrant(access, name, "read");
  const [schema, catalog] = await Promise.all([collectionSchema(db, name), listCollections(db)]);
  requireMcpCollection(schema.settings);
  return { allowed, schema, catalog: mcpCatalog(catalog) };
}

export type CollectionData = Awaited<ReturnType<typeof collectionData>>;
