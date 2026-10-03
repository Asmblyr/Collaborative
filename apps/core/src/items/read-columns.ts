import { AccessDeniedError } from "../permissions/access.js";
import type { collectionSchema } from "./schema-repository.js";
import { ItemError } from "./validation.js";

type Schema = Awaited<ReturnType<typeof collectionSchema>>;

function physicalField(schema: Schema, name: string): boolean {
  return (
    name === schema.settings.primaryKey.name ||
    schema.fields.has(name) ||
    (name === "created_at" && schema.settings.timestamps.createdAt) ||
    (name === "updated_at" && schema.settings.timestamps.updatedAt)
  );
}

/** Omitted projection preserves the existing /items response. */
export function selectedColumns(
  schema: Schema,
  allowed: string[],
  requested?: unknown,
): string[] {
  const primaryKey = schema.settings.primaryKey.name;
  if (requested === undefined) {
    if (allowed.includes("*")) return ["*"];
    return [
      ...new Set([
        primaryKey,
        ...allowed.filter((name) => physicalField(schema, name)),
      ]),
    ];
  }

  let fields = requested;
  if (typeof requested === "string") {
    fields = requested === "" ? [] : requested.split(",");
  }
  if (
    !Array.isArray(fields) ||
    fields.some((field) => typeof field !== "string")
  ) {
    throw new ItemError(
      "Fields must be an array of field names or a comma-separated string",
      400,
    );
  }
  const columns = new Set([primaryKey]);
  for (const field of fields) {
    if (!physicalField(schema, field))
      throw new ItemError(`Invalid read field: ${field}`, 400);
    if (
      field !== primaryKey &&
      !allowed.includes("*") &&
      !allowed.includes(field)
    ) {
      throw new AccessDeniedError();
    }
    columns.add(field);
  }
  return [...columns];
}
