import type {
  CollectionField,
  CollectionMode,
  CreateCollectionInput,
  PrimaryKeyType,
} from "./types.js";
import {
  CollectionInputError,
  object,
  validName,
  parseMutableCollectionName,
  parseFolderId,
  parseField,
} from "./validation.js";
import {
  parseDisplayName,
  parseCollectionMcp,
  parseCollectionHidden,
} from "./metadata-validation.js";
import { parseCollectionState } from "./state-validation.js";

export function parseCreateCollection(value: unknown): CreateCollectionInput {
  const input = object(value);
  if (
    !input ||
    Object.keys(input).some(
      (key) =>
        ![
          "name",
          "displayName",
          "hidden",
          "mcp",
          "folderId",
          "parentCollection",
          "workspaceId",
          "mode",
          "primaryKey",
          "timestamps",
          "state",
          "fields",
        ].includes(key),
    )
  ) {
    throw new CollectionInputError("Expected collection settings and optional fields");
  }
  const name = parseMutableCollectionName(input.name);
  if (
    input.workspaceId !== undefined &&
    input.workspaceId !== null &&
    (typeof input.workspaceId !== "string" ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(input.workspaceId))
  ) {
    throw new CollectionInputError("Invalid workspace identifier");
  }
  const mode = input.mode ?? "multiple";
  if (mode !== "multiple" && mode !== "single") {
    throw new CollectionInputError("Collection mode must be multiple or single");
  }
  const key =
    input.primaryKey === undefined ? { name: "id", type: "uuid" } : object(input.primaryKey);
  if (
    !key ||
    Object.keys(key).some((keyName) => keyName !== "name" && keyName !== "type") ||
    !validName(key.name) ||
    !["uuid", "serial", "bigserial", "text"].includes(key.type as string)
  ) {
    throw new CollectionInputError("Primary key needs a valid name and type");
  }
  const timestampInput =
    input.timestamps === undefined
      ? { createdAt: false, updatedAt: false }
      : object(input.timestamps);
  if (
    !timestampInput ||
    Object.keys(timestampInput).some(
      (keyName) => keyName !== "createdAt" && keyName !== "updatedAt",
    ) ||
    (timestampInput.createdAt !== undefined && typeof timestampInput.createdAt !== "boolean") ||
    (timestampInput.updatedAt !== undefined && typeof timestampInput.updatedAt !== "boolean")
  ) {
    throw new CollectionInputError("Timestamps must use createdAt and updatedAt boolean flags");
  }
  const timestamps = {
    createdAt: timestampInput.createdAt === true,
    updatedAt: timestampInput.updatedAt === true,
  };
  const state = parseCollectionState(input.state);
  if (key.name === state?.field)
    throw new CollectionInputError("Primary key conflicts with system state");
  if (
    (key.name === "created_at" && timestamps.createdAt) ||
    (key.name === "updated_at" && timestamps.updatedAt)
  ) {
    throw new CollectionInputError("Primary key name conflicts with a managed timestamp");
  }
  const inputFields = input.fields ?? [];
  if (!Array.isArray(inputFields) || inputFields.length > 32) {
    throw new CollectionInputError("A collection accepts up to 32 custom fields");
  }

  const names = new Set<string>([key.name as string]);
  if (timestamps.createdAt) names.add("created_at");
  if (timestamps.updatedAt) names.add("updated_at");
  if (state) names.add(state.field);
  const fields: CollectionField[] = inputFields.map((value: unknown) => {
    const field = parseField(value);
    if (names.has(field.name)) {
      throw new CollectionInputError(`Field name is already used: ${field.name}`);
    }
    names.add(field.name);
    return field;
  });

  return {
    name,
    displayName: parseDisplayName(input.displayName),
    hidden: parseCollectionHidden(input.hidden),
    mcp: parseCollectionMcp(input.mcp),
    folderId: parseFolderId(input.folderId),
    parentCollection:
      input.parentCollection === undefined || input.parentCollection === null
        ? null
        : parseMutableCollectionName(input.parentCollection),
    ...(input.workspaceId ? { workspaceId: input.workspaceId as string } : {}),
    mode: mode as CollectionMode,
    primaryKey: { name: key.name as string, type: key.type as PrimaryKeyType },
    timestamps,
    state,
    fields,
  };
}
