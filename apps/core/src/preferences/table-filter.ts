import type { Knex } from "knex";
import { listCollections } from "../collections/catalog-repository.js";
import { collectionSchema } from "../items/schema-repository.js";
import { parseItemFilters } from "../items/filter-input.js";
import { plainFilter, storedFilterInput } from "../items/filter-wire.js";
import { ItemError } from "../items/validation.js";
import {
  AccessDeniedError,
  requireGrant,
  type Access,
} from "../permissions/access.js";

export async function tableFilter(
  db: Knex,
  name: string,
  access: Access,
  value: unknown,
  restoring = false,
): Promise<object | null> {
  if (value === null) {
    return null;
  }
  const [schema, catalog] = await Promise.all([
    collectionSchema(db, name),
    listCollections(db),
  ]);
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ItemError("Expected a filter group or null", 400);
    }
    const parsed = parseItemFilters(
      JSON.stringify(restoring ? storedFilterInput(value) : value),
      name,
      schema,
      requireGrant(access, name, "read"),
      catalog,
      access,
    );
    return parsed.children.length ? plainFilter(parsed) : null;
  } catch (error) {
    if (
      restoring &&
      (error instanceof AccessDeniedError ||
        (error instanceof ItemError && error.statusCode === 400))
    ) {
      return null;
    }
    throw error;
  }
}
