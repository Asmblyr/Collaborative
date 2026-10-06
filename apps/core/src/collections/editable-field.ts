import type { Knex } from "knex";
import type { FieldPresentation } from "./field-presentation-validation.js";
import type { JsonValue } from "./structured-values.js";
import type { PrimaryKeyType } from "./types.js";
import { fieldTypeFromDatabase } from "./field-types.js";
import { CollectionFieldNotFoundError } from "./validation.js";

interface EditableFieldRow {
  is_nullable: "YES" | "NO";
  required: boolean;
  data_type: string;
  character_maximum_length: number | null;
  semantic_type: string | null;
  default_value: JsonValue;
  presentation: FieldPresentation | null;
  relation_key_type: PrimaryKeyType | null;
}

export async function readEditableField(
  database: Knex,
  collection: string,
  field: string,
) {
  const result = await database.raw<{ rows: EditableFieldRow[] }>(
    `
    SELECT c.is_nullable, c.data_type, c.character_maximum_length, fm.semantic_type, fm.default_value, fm.presentation,
      COALESCE(fm.required, FALSE) AS required, target.primary_key_type AS relation_key_type
    FROM public.asmblyr_columns AS c
    LEFT JOIN public.asmblyr_field_metadata AS fm
      ON fm.collection_name = c.table_name AND fm.field_name = c.column_name
    LEFT JOIN public.asmblyr_relations AS r
      ON r.source_collection = c.table_name AND r.source_field = c.column_name
    LEFT JOIN public.asmblyr_collections AS target ON target.name = r.target_collection
    WHERE c.table_schema = 'public' AND c.table_name = ? AND c.column_name = ?
  `,
    [collection, field],
  );
  const row = result.rows[0];
  if (!row) throw new CollectionFieldNotFoundError(field);
  return {
    ...row,
    type: fieldTypeFromDatabase(row.data_type, row.semantic_type),
  };
}

export type EditableField = Awaited<ReturnType<typeof readEditableField>>;
