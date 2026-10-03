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
    Object.keys(body).length !== 1 ||
    typeof (body as { searchable?: unknown }).searchable !== "boolean"
  ) {
    throw new CollectionInputError("Expected a searchable boolean setting");
  }
  const searchable = (body as { searchable: boolean }).searchable;
  if (!(await findCollectionSettings(database, name)))
    throw new CollectionNotFoundError(name);

  const physical = await database("asmblyr_relations")
    .withSchema("public")
    .where({ source_collection: name, source_field: relationField })
    .update({ searchable })
    .returning<string[]>("source_field");
  if (physical.length > 0) return { searchable };

  const virtual = await database("asmblyr_relation_aliases")
    .withSchema("public")
    .where({ collection_name: name, field_name: relationField })
    .update({ searchable })
    .returning<string[]>("field_name");
  if (virtual.length > 0) return { searchable };
  throw new CollectionFieldNotFoundError(relationField);
}
