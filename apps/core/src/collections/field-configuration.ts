import type { Knex } from "knex";
import { objectInput } from "../shared/input.js";
import { listCollections } from "./catalog-repository.js";
import { readEditableField } from "./editable-field.js";
import { updateFieldPresentation } from "./field-presentation.js";
import { updateFieldDefinition } from "./field-update-service.js";
import { updateRelationSearch } from "./relation-search.js";
import { addFieldDefinition } from "./service.js";
import { lockedCollectionSettings, isManagedColumn } from "./settings-repository.js";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
  parseMutableFieldName,
} from "./validation.js";

// Index DDL deliberately has its own endpoint: PostgreSQL cannot build an index
// CONCURRENTLY in a transaction. All field metadata is committed together here.
export async function saveFieldConfiguration(
  database: Knex,
  collection: unknown,
  field: unknown,
  body: unknown,
  create = false,
) {
  const name = parseMutableCollectionName(collection);
  const column = parseMutableFieldName(field);
  const input = objectInput(body, ["field", "presentation", "searchable", "relationSearchable"]);
  if (!Object.keys(input).length) throw new CollectionInputError("Expected field configuration");
  for (const key of ["searchable", "relationSearchable"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") {
      throw new CollectionInputError(`Expected a boolean: ${key}`);
    }
  }
  return database.transaction(async (transaction) => {
    const settings = await lockedCollectionSettings(transaction, name);
    if (isManagedColumn(settings, column)) {
      throw new CollectionInputError(`Field is managed by Core: ${column}`);
    }
    if (create) {
      const definition = objectInput(input.field, [
        "name",
        "type",
        "required",
        "nullable",
        "defaultValue",
        "searchable",
      ]);
      if (definition.name !== column)
        throw new CollectionInputError("Field name does not match URL");
      await addFieldDefinition(transaction, name, definition);
    } else if (input.field !== undefined) {
      await updateFieldDefinition(transaction, name, column, input.field, input.presentation);
    }
    if (input.presentation !== undefined) {
      await updateFieldPresentation(transaction, name, column, input.presentation);
    }
    if (input.searchable !== undefined) {
      const current = await readEditableField(transaction, name, column);
      if (current.relation_key_type || !["text", "email"].includes(current.type ?? "")) {
        throw new CollectionInputError("Search settings require a text or email field");
      }
      await transaction("asmblyr_field_metadata")
        .withSchema("public")
        .insert({ collection_name: name, field_name: column, searchable: input.searchable })
        .onConflict(["collection_name", "field_name"])
        .merge({ searchable: input.searchable });
    }
    if (input.relationSearchable !== undefined) {
      await updateRelationSearch(transaction, name, column, {
        searchable: input.relationSearchable,
      });
    }
    const result = (await listCollections(transaction)).find((entry) => entry.name === name);
    if (!result) throw new CollectionNotFoundError(name);
    return result;
  });
}
