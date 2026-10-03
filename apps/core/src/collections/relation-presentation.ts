import type { RelationPresentation } from "@asmblyr/contracts";
export type { RelationPresentation } from "@asmblyr/contracts";
import type { Knex } from "knex";
import { collectionSchema } from "../items/schema-repository.js";
import { CollectionInputError } from "./validation.js";

export function parseRelationPresentation(body: unknown): RelationPresentation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CollectionInputError("Expected relation display settings");
  }
  const value = body as Record<string, unknown>;
  const allowed = [
    "layout",
    "columns",
    "labelField",
    "sortField",
    "direction",
    "pageSize",
    "allowCreate",
    "allowSelect",
  ];
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new CollectionInputError("Unknown relation display setting");
  const name = (v: unknown): v is string =>
    typeof v === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(v);
  const layout = value.layout ?? "table",
    columns = value.columns ?? [];
  const labelField = value.labelField ?? null,
    sortField = value.sortField ?? null;
  const direction = value.direction ?? "asc",
    pageSize = value.pageSize ?? 10;
  const allowCreate = value.allowCreate ?? true,
    allowSelect = value.allowSelect ?? true;
  if (
    (layout !== "table" && layout !== "list") ||
    (direction !== "asc" && direction !== "desc") ||
    ![10, 25, 50].includes(pageSize as number) ||
    typeof allowCreate !== "boolean" ||
    typeof allowSelect !== "boolean" ||
    (labelField !== null && !name(labelField)) ||
    (sortField !== null && !name(sortField)) ||
    !Array.isArray(columns) ||
    columns.length > 12 ||
    columns.some((v) => !name(v)) ||
    new Set(columns).size !== columns.length
  ) {
    throw new CollectionInputError(
      "Invalid relation display settings (up to 12 distinct columns)",
    );
  }
  return {
    layout,
    columns,
    labelField,
    sortField,
    direction,
    pageSize: pageSize as 10 | 25 | 50,
    allowCreate,
    allowSelect,
  };
}

export async function validateRelationPresentation(
  database: Knex,
  collection: string,
  value: RelationPresentation,
) {
  const { settings, fields } = await collectionSchema(database, collection);
  const physical = new Set([
    settings.primaryKey.name,
    ...fields.keys(),
    ...(settings.timestamps.createdAt ? ["created_at"] : []),
    ...(settings.timestamps.updatedAt ? ["updated_at"] : []),
  ]);
  if (
    [...value.columns, value.labelField, value.sortField].some(
      (name) => name !== null && !physical.has(name),
    )
  ) {
    throw new CollectionInputError(
      "Relation display must reference existing physical fields of the related collection",
    );
  }
  if (
    value.labelField &&
    ["json", "files", "file", "boolean"].includes(
      fields.get(value.labelField)?.type ?? "",
    )
  ) {
    throw new CollectionInputError(
      "Choose a text, number, date or key field for the record label",
    );
  }
}
