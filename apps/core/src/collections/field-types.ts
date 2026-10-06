import type { Knex } from "knex";
import type { CollectionField, FieldType, PrimaryKey } from "./types.js";

export const fieldTypes = [
  "text",
  "integer",
  "bigint",
  "boolean",
  "datetime",
  "date",
  "email",
  "decimal",
  "json",
  "uuid",
  "file",
  "files",
] as const satisfies readonly FieldType[];

export function fieldTypeFromDatabase(
  dataType: string,
  semanticType?: string | null,
): FieldType | null {
  const text = ["text", "character varying", "varchar"].includes(dataType);
  if (semanticType === "email") return text ? "email" : null;
  if (semanticType === "file") return dataType === "uuid" ? "file" : null;
  if (semanticType === "files") return dataType === "jsonb" ? "files" : null;
  if (dataType === "numeric") return "decimal";
  if (dataType === "jsonb") return "json";
  if (dataType === "timestamp with time zone") return "datetime";
  if (text) return "text";
  return fieldTypes.find((type) => type === dataType) ?? null;
}

export function addFieldColumn(
  table: Knex.TableBuilder,
  field: CollectionField,
): void {
  let column: Knex.ColumnBuilder;
  switch (field.type) {
    case "text":
    case "email":
      column = table.text(field.name);
      break;
    case "integer":
      column = table.integer(field.name);
      break;
    case "bigint":
      column = table.bigInteger(field.name);
      break;
    case "date":
      column = table.date(field.name);
      break;
    case "uuid":
      column = table.uuid(field.name);
      break;
    case "boolean":
      column = table.boolean(field.name);
      break;
    case "datetime":
      column = table.timestamp(field.name, { useTz: true });
      break;
    case "decimal":
      column = table.decimal(field.name, 30, 10);
      break;
    case "json":
      column = table.jsonb(field.name);
      break;
    case "files":
      column = table.jsonb(field.name);
      table.index(field.name, undefined, "gin");
      break;
    case "file":
      column = table.uuid(field.name);
      table
        .foreign(field.name)
        .references("id")
        .inTable("public.asmblyr_files")
        .onDelete("RESTRICT");
      table.index(field.name);
      break;
    default: {
      const unsupported: never = field.type;
      throw new Error(`Unsupported field type: ${unsupported}`);
    }
  }
  if (field.defaultValue !== undefined)
    column.defaultTo(
      field.type === "json" || typeof field.defaultValue === "object"
        ? JSON.stringify(field.defaultValue)
        : field.defaultValue,
    );
  if (!field.nullable) column.notNullable();
}

export function addPrimaryKeyColumn(
  table: Knex.TableBuilder,
  key: PrimaryKey,
  database: Knex,
): void {
  switch (key.type) {
    case "uuid":
      table
        .uuid(key.name)
        .primary()
        .defaultTo(database.raw("gen_random_uuid()"));
      break;
    case "serial":
      table.increments(key.name);
      break;
    case "bigserial":
      table.bigIncrements(key.name);
      break;
    case "text":
      table.string(key.name, 255).primary();
      break;
  }
}
