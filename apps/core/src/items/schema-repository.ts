import type { Knex } from "knex";
import { fieldTypeFromDatabase } from "../collections/field-types.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { ItemError, parseCollectionName } from "./validation.js";
import type { ItemField } from "./types.js";
import type { FieldPresentation } from "../collections/field-presentation-validation.js";
import type { JsonValue } from "../collections/structured-values.js";

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  semantic_type: string | null;
  required: boolean | null;
  default_value: JsonValue;
  searchable: boolean | null;
  presentation: FieldPresentation;
  relation_target: string | null;
  relation_key_type: "uuid" | "serial" | "bigserial" | "text" | null;
}

export async function collectionSchema(database: Knex, name: string) {
  parseCollectionName(name);
  const settings = await findCollectionSettings(database, name);
  if (!settings) throw new ItemError(`Collection not found: ${name}`, 404);

  const result = await database.raw<{ rows: ColumnRow[] }>(
    `
    SELECT c.column_name, c.data_type, c.is_nullable, fm.semantic_type, fm.required,
      fm.default_value, fm.searchable, fm.presentation, r.target_collection AS relation_target,
      target.primary_key_type AS relation_key_type
    FROM information_schema.columns AS c
    LEFT JOIN public.asmblyr_field_metadata AS fm
      ON fm.collection_name = ? AND fm.field_name = c.column_name
    LEFT JOIN public.asmblyr_relations AS r
      ON r.source_collection = ? AND r.source_field = c.column_name
    LEFT JOIN public.asmblyr_collections AS target
      ON target.name = r.target_collection
    WHERE c.table_schema = 'public' AND c.table_name = ?
      AND c.column_name <> ?
      AND NOT (c.column_name = 'created_at' AND ?)
      AND NOT (c.column_name = 'updated_at' AND ?)
    ORDER BY c.ordinal_position
  `,
    [
      name,
      name,
      name,
      settings.primaryKey.name,
      settings.timestamps.createdAt,
      settings.timestamps.updatedAt,
    ],
  );
  const fields = new Map<string, ItemField>(
    result.rows.map((column) => [
      column.column_name,
      {
        name: column.column_name,
        type: column.relation_target
          ? "relation"
          : fieldTypeFromDatabase(column.data_type, column.semantic_type),
        ...(column.relation_target && column.relation_key_type
          ? {
              relation: {
                collection: column.relation_target,
                primaryKeyType: column.relation_key_type,
              },
            }
          : {}),
        required: column.required ?? false,
        nullable: column.is_nullable === "YES",
        presentation: column.presentation,
        ...(column.default_value === null
          ? {}
          : { defaultValue: column.default_value }),
        ...(!column.relation_target &&
        ["text", "email"].includes(
          fieldTypeFromDatabase(column.data_type, column.semantic_type) ?? "",
        )
          ? { searchable: column.searchable ?? true }
          : {}),
      },
    ]),
  );
  return { settings, fields };
}

export async function lockedCollectionSchema(
  transaction: Knex.Transaction,
  name: string,
) {
  parseCollectionName(name);
  try {
    // Compatible with other item writes; excludes concurrent field or table DDL.
    await transaction.raw("LOCK TABLE ?? IN ROW EXCLUSIVE MODE", [
      `public.${name}`,
    ]);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42P01"
    ) {
      throw new ItemError(`Collection not found: ${name}`, 404);
    }
    throw error;
  }
  return collectionSchema(transaction, name);
}
