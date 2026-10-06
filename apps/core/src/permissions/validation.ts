import { parseRowFilter } from "./row-filter.js";
import type {
  PermissionFilter,
  SettingsPermissionInput,
} from "@asmblyr-collaborative/contracts";
import { parseSettingsPermission } from "./settings-permissions.js";
import {
  parseMutableCollectionName,
  parseMutableFieldName,
} from "../collections/validation.js";
import { parseId } from "../policies/validation.js";

export type PermissionAction = "create" | "read" | "update" | "delete";

export class PermissionInputError extends Error {
  readonly statusCode = 400;
}

export class PermissionNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("Permission or target not found");
  }
}

export class PermissionConflictError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("Permission conflict");
  }
}

export type CreatePermissionInput =
  | CollectionPermissionInput
  | SettingsPermissionInput;

export interface CollectionPermissionInput {
  collection: string;
  action: PermissionAction;
  fields: string[];
  rowFilter?: PermissionFilter | null;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function parseAction(value: unknown): PermissionAction {
  if (
    value !== "create" &&
    value !== "read" &&
    value !== "update" &&
    value !== "delete"
  ) {
    throw new PermissionInputError("Invalid permission action");
  }
  return value;
}

function parseFields(value: unknown, action: PermissionAction): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 64 ||
    value.some((field) => typeof field !== "string")
  ) {
    throw new PermissionInputError("Permission needs a nonempty fields array");
  }
  const fields = value as string[];
  if (
    new Set(fields).size !== fields.length ||
    (fields.includes("*") && fields.length !== 1) ||
    (action === "delete" && (fields.length !== 1 || fields[0] !== "*"))
  ) {
    throw new PermissionInputError("Invalid permission fields");
  }
  for (const field of fields) {
    if (field !== "*") {
      parseMutableFieldName(field);
    }
  }
  return fields;
}

export function parseCreatePermission(body: unknown): CreatePermissionInput {
  const input = object(body);
  if (input && "section" in input) {
    return parseSettingsPermission(input);
  }
  if (
    !input ||
    !exactKeys(input, [
      "collection",
      "action",
      "fields",
      ...("rowFilter" in input ? ["rowFilter"] : []),
    ])
  ) {
    throw new PermissionInputError("Expected collection, action and fields");
  }
  const action = parseAction(input.action);
  return {
    collection: parseMutableCollectionName(input.collection),
    action,
    fields: parseFields(input.fields, action),
    ...("rowFilter" in input
      ? { rowFilter: parseRowFilter(input.rowFilter) }
      : {}),
  };
}

export function parseUpdatePermission(
  body: unknown,
  action: PermissionAction,
): string[] {
  const input = object(body);
  if (
    !input ||
    !exactKeys(input, [
      "fields",
      ...("rowFilter" in input ? ["rowFilter"] : []),
    ])
  ) {
    throw new PermissionInputError("Expected fields");
  }
  if ("rowFilter" in input) parseRowFilter(input.rowFilter);
  return parseFields(input.fields, action);
}

export function parsePolicyFilter(query: unknown): string | undefined {
  const input = object(query);
  if (!input || Object.keys(input).some((key) => key !== "policyId")) {
    throw new PermissionInputError("Only policyId filter is supported");
  }
  return input.policyId === undefined ? undefined : parseId(input.policyId);
}
