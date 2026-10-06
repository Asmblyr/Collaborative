import type { CollectionField, FieldType } from "./types.js";
import { fieldTypes } from "./field-types.js";
import { parseFieldValue } from "./field-values.js";
import type { JsonValue } from "./structured-values.js";

const identifier = /^[a-z][a-z0-9_]*$/;

export class CollectionInputError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "CollectionInputError";
  }
}

export class CollectionConflictError extends Error {
  readonly statusCode = 409;

  constructor(name: string) {
    super(`Collection already exists: ${name}`);
    this.name = "CollectionConflictError";
  }
}

export class ProtectedCollectionError extends Error {
  readonly statusCode = 403;

  constructor(owner = "Core") {
    super(`Collection structure is managed by ${owner}`);
    this.name = "ProtectedCollectionError";
  }
}

export class CollectionNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(name: string) {
    super(`Collection not found: ${name}`);
    this.name = "CollectionNotFoundError";
  }
}

export class CollectionFieldConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "CollectionFieldConflictError";
  }
}

export class CollectionFieldNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(name: string) {
    super(`Field not found: ${name}`);
    this.name = "CollectionFieldNotFoundError";
  }
}

export class ProtectedFieldError extends Error {
  readonly statusCode = 403;

  constructor(name: string) {
    super(`Field structure is managed by Core: ${name}`);
    this.name = "ProtectedFieldError";
  }
}

export class CollectionDependencyError extends Error {
  readonly statusCode = 409;

  constructor(message = "Structure has dependent database objects") {
    super(message);
    this.name = "CollectionDependencyError";
  }
}

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function validName(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 63 && identifier.test(value)
  );
}

export function parseMutableCollectionName(value: unknown): string {
  if (typeof value === "string" && value.toLowerCase().startsWith("asmblyr_")) {
    throw new ProtectedCollectionError();
  }
  if (typeof value === "string" && value.toLowerCase().startsWith("plugin_")) {
    throw new ProtectedCollectionError("a plugin");
  }
  if (!validName(value)) {
    throw new CollectionInputError(
      "Collection name must use lowercase letters, digits and underscores",
    );
  }
  return value;
}

export function parseFolderId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new CollectionInputError("Invalid folder ID");
  }
  return value;
}

export function parseField(value: unknown): CollectionField {
  const field = object(value);
  if (
    !field ||
    Object.keys(field).some(
      (key) =>
        ![
          "name",
          "type",
          "required",
          "nullable",
          "defaultValue",
          "searchable",
        ].includes(key),
    ) ||
    !validName(field.name) ||
    !fieldTypes.includes(field.type as FieldType) ||
    (field.required !== undefined && typeof field.required !== "boolean") ||
    (field.nullable !== undefined && typeof field.nullable !== "boolean") ||
    ("defaultValue" in field &&
      (field.defaultValue === null ||
        field.defaultValue === undefined ||
        field.type === "file" ||
        field.type === "files")) ||
    ("searchable" in field &&
      (typeof field.searchable !== "boolean" ||
        (field.type !== "text" && field.type !== "email")))
  ) {
    throw new CollectionInputError(
      "Field needs a valid name, type and optional required, nullable and defaultValue settings",
    );
  }
  const required = field.required === true;
  return {
    name: field.name,
    type: field.type as FieldType,
    required,
    nullable: field.nullable === undefined ? !required : field.nullable,
    ...(field.type === "text" || field.type === "email"
      ? { searchable: field.searchable !== false }
      : {}),
    ...("defaultValue" in field
      ? {
          defaultValue: parseDefaultValue(
            field.type as FieldType,
            field.name,
            required,
            field.defaultValue,
          ),
        }
      : {}),
  };
}

export function parseDefaultValue(
  type: FieldType | null,
  name: string,
  required: boolean,
  value: unknown,
): JsonValue {
  try {
    return parseFieldValue({ type, name, required }, value);
  } catch {
    throw new CollectionInputError(`Invalid default value for field: ${name}`);
  }
}

export function parseMutableFieldName(value: unknown): string {
  if (!validName(value)) {
    throw new CollectionInputError(
      "Field name must use lowercase letters, digits and underscores",
    );
  }
  return value;
}

export interface UpdateFieldInput {
  required?: boolean;
  nullable?: boolean;
  defaultValue?: unknown;
}

export function parseUpdateField(value: unknown): UpdateFieldInput {
  const input = object(value);
  if (input && "name" in input) {
    throw new CollectionInputError(
      "Field name cannot be changed after creation",
    );
  }
  if (
    !input ||
    Object.keys(input).length === 0 ||
    Object.keys(input).some(
      (key) => !["required", "nullable", "defaultValue"].includes(key),
    ) ||
    ("required" in input && typeof input.required !== "boolean") ||
    ("nullable" in input && typeof input.nullable !== "boolean") ||
    ("defaultValue" in input && input.defaultValue === undefined)
  ) {
    throw new CollectionInputError(
      "Expected a required, nullable or defaultValue setting",
    );
  }
  return {
    ...("required" in input ? { required: input.required as boolean } : {}),
    ...("nullable" in input ? { nullable: input.nullable as boolean } : {}),
    ...("defaultValue" in input ? { defaultValue: input.defaultValue } : {}),
  };
}

export { parseCreateCollection } from "./create-validation.js";
