import type { Knex } from "knex";
import type { CollectionField } from "./types.js";

export async function saveFieldMetadata(
  database: Knex,
  collectionName: string,
  fields: CollectionField[],
) {
  const configuredFields = fields.filter(
    (field) =>
      ["email", "file", "files"].includes(field.type) ||
      field.required ||
      field.defaultValue !== undefined ||
      field.searchable === false,
  );
  if (configuredFields.length === 0) return;
  await database("asmblyr_field_metadata")
    .withSchema("public")
    .insert(
      configuredFields.map((field) => ({
        collection_name: collectionName,
        field_name: field.name,
        semantic_type: ["email", "file", "files"].includes(field.type) ? field.type : null,
        required: field.required,
        default_value: field.defaultValue === undefined ? null : JSON.stringify(field.defaultValue),
        searchable: field.searchable !== false,
      })),
    );
}
