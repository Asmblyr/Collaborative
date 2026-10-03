import type { ItemField } from "./types.js";
import type { PrimaryKeyType } from "../collections/types.js";
import { parseFieldValue } from "../collections/field-values.js";
import type { JsonValue } from "../collections/structured-values.js";
import { parsePresentedValue } from "../collections/presented-value.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const namePattern = /^[a-z][a-z0-9_]{0,62}$/;

export class ItemError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ItemError";
  }
}

export function parseCollectionName(name: string): string {
  if (!namePattern.test(name))
    throw new ItemError("Invalid collection name", 400);
  return name;
}

export function parseItemId(id: string, type: PrimaryKeyType): string {
  if (type === "uuid" && !uuidPattern.test(id))
    throw new ItemError("Invalid item id", 400);
  if (
    type === "serial" &&
    (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647)
  ) {
    throw new ItemError("Invalid item id", 400);
  }
  if (
    type === "bigserial" &&
    (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
  ) {
    throw new ItemError("Invalid item id", 400);
  }
  if (type === "text" && (id.trim().length === 0 || id.length > 255)) {
    throw new ItemError("Invalid item id", 400);
  }
  return id;
}

export function parseItem(
  value: unknown,
  fields: Map<string, ItemField>,
  create: boolean,
  manualKey?: string,
) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ItemError("Item must be an object", 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length === 0 && !create)
    throw new ItemError("Item cannot be empty", 400);

  const item: Record<string, JsonValue> = {};
  for (const [name, fieldValue] of Object.entries(input)) {
    if (create && name === manualKey) {
      if (
        typeof fieldValue !== "string" ||
        fieldValue.trim().length === 0 ||
        fieldValue.length > 255
      ) {
        throw new ItemError(`Invalid primary key: ${name}`, 400);
      }
      item[name] = fieldValue;
      continue;
    }
    const field = fields.get(name);
    if (!field) throw new ItemError(`Unknown or read-only field: ${name}`, 400);
    if (fieldValue === null) {
      if (field.required)
        throw new ItemError(`Field is required: ${name}`, 400);
      if (!field.nullable)
        throw new ItemError(`Field cannot be null: ${name}`, 400);
      item[name] = null;
      continue;
    }

    try {
      if (field.type === "relation") {
        if (!field.relation)
          throw new ItemError(`Relation is not configured: ${name}`, 409);
        const keyType = field.relation.primaryKeyType;
        const id =
          typeof fieldValue === "number" &&
          Number.isSafeInteger(fieldValue) &&
          (keyType === "serial" || keyType === "bigserial")
            ? String(fieldValue)
            : fieldValue;
        if (typeof id !== "string")
          throw new ItemError(`Invalid relation ID: ${name}`, 400);
        item[name] = parseItemId(id, keyType);
      } else {
        item[name] = parseFieldValue(
          { name: field.name, type: field.type, required: field.required },
          fieldValue,
        );
        item[name] = parsePresentedValue(
          item[name],
          field.presentation,
          field.required,
        );
      }
    } catch (error) {
      throw new ItemError(
        error instanceof Error
          ? error.message
          : `Invalid value for field: ${name}`,
        400,
      );
    }
  }

  if (create) {
    if (manualKey && item[manualKey] === undefined) {
      throw new ItemError(`Primary key is required: ${manualKey}`, 400);
    }
    for (const field of fields.values()) {
      if (item[field.name] === undefined) {
        if (field.defaultValue !== undefined) {
          try {
            item[field.name] = parsePresentedValue(
              field.defaultValue,
              field.presentation,
              field.required,
            );
          } catch (error) {
            throw new ItemError(
              error instanceof Error ? error.message : "Invalid default",
              400,
            );
          }
          continue;
        }
        if (field.required)
          throw new ItemError(`Field is required: ${field.name}`, 400);
        if (!field.nullable)
          throw new ItemError(`Field cannot be omitted: ${field.name}`, 400);
      }
    }
  }
  return item;
}
