import { parseSearchPriority, saveSearchPriority } from "./search-priority.js";
import type { Knex } from "knex";
import { findCollectionSettings } from "./settings-repository.js";
import {
  CollectionFieldNotFoundError,
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
  parseMutableFieldName,
} from "./validation.js";

export async function updateRelationSearch(
  database: Knex,
  collection: unknown,
  field: unknown,
  body: unknown,
) {
  const name = parseMutableCollectionName(collection);
  const relationField = parseMutableFieldName(field);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["searchable", "searchPriority"].includes(key),
    ) ||
    typeof (body as { searchable?: unknown }).searchable !== "boolean"
  ) {
    throw new CollectionInputError("Expected a searchable boolean setting");
  }
  const searchable = (body as { searchable: boolean }).searchable;
  if (!(await findCollectionSettings(database, name)))
    throw new CollectionNotFoundError(name);

  const priority = Object.hasOwn(body, "searchPriority")
    ? parseSearchPriority((body as Record<string, unknown>).searchPriority)
    : undefined;
  return database.transaction(async (transaction) => {
    const system = await transaction("public.asmblyr_relations")
      .where({
        source_collection: name,
        source_field: relationField,
        target_system: "users",
      })
      .first("source_field");
    if (system && searchable) {
      throw new CollectionInputError(
        "System user references do not support related full-text search",
      );
    }
    const physical = await transaction("asmblyr_relations")
      .withSchema("public")
      .where({ source_collection: name, source_field: relationField })
      .update({ searchable })
      .returning<string[]>("source_field");
    if (physical.length > 0) {
      if (priority !== undefined) {
        await saveSearchPriority(transaction, name, relationField, priority);
      }
      return {
        searchable,
        ...(priority !== undefined ? { searchPriority: priority } : {}),
      };
    }

    const virtual = await transaction("asmblyr_relation_aliases")
      .withSchema("public")
      .where({ collection_name: name, field_name: relationField })
      .update({ searchable })
      .returning<string[]>("field_name");
    if (virtual.length > 0) {
      if (priority !== undefined) {
        await saveSearchPriority(transaction, name, relationField, priority);
      }
      return {
        searchable,
        ...(priority !== undefined ? { searchPriority: priority } : {}),
      };
    }
    throw new CollectionFieldNotFoundError(relationField);
  });
}
