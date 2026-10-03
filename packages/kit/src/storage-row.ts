import type { ItemRecord, JsonValue } from "@asmblyr/contracts";
import type { CollectionDefinition } from "./collection.js";
import type { CollectionRow } from "./collection-types.js";

function fieldValue(
  value: unknown,
  type: string,
  nullable: boolean,
  address: string,
): JsonValue {
  if (value === null && nullable) return null;

  switch (type) {
    case "text":
    case "email":
    case "uuid":
    case "file":
    case "decimal":
    case "bigserial":
      if (typeof value === "string") return value;
      break;
    case "integer":
    case "serial":
      if (typeof value === "number" && Number.isSafeInteger(value))
        return value;
      break;
    case "boolean":
      if (typeof value === "boolean") return value;
      break;
    case "datetime": {
      if (!(value instanceof Date) && typeof value !== "string") break;
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isFinite(date.getTime())) return date.toISOString();
      break;
    }
    case "files":
      if (
        Array.isArray(value) &&
        value.every((entry) => typeof entry === "string")
      )
        return value;
      break;
    case "json":
      // PostgreSQL jsonb already contains JSON values, including the JSON null literal.
      if (value !== undefined)
        return JSON.parse(JSON.stringify(value)) as JsonValue;
      break;
  }
  throw new Error(
    `Storage value does not match collection declaration: ${address}`,
  );
}

/** Check the boundary once, before exposing an inferred row to plugin code. */
export function collectionRow<Definition extends CollectionDefinition>(
  definition: Definition,
  row: ItemRecord,
): CollectionRow<Definition> {
  const result: Record<string, JsonValue> = {};
  const key = definition.primaryKey;
  result[key.name] = fieldValue(
    row[key.name],
    key.type,
    false,
    `${definition.name}.${key.name}`,
  );
  for (const [name, field] of Object.entries(definition.fields)) {
    result[name] = fieldValue(
      row[name],
      field.type,
      field.nullable,
      `${definition.name}.${name}`,
    );
  }
  if (definition.timestamps?.createdAt)
    result.created_at = fieldValue(
      row.created_at,
      "datetime",
      false,
      `${definition.name}.created_at`,
    );
  if (definition.timestamps?.updatedAt)
    result.updated_at = fieldValue(
      row.updated_at,
      "datetime",
      false,
      `${definition.name}.updated_at`,
    );
  return result as CollectionRow<Definition>;
}
