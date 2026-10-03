import { CollectionInputError } from "./validation.js";

export interface CollectionMcp {
  enabled: boolean;
  description: string | null;
}

export function parseCollectionHidden(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean")
    throw new CollectionInputError("hidden must be a boolean");
  return value;
}

export function parseDisplayName(value: unknown): string | null {
  return nullableText(value, 120, "displayName");
}

function nullableText(
  value: unknown,
  limit: number,
  label: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > limit ||
    value.includes("\0")
  ) {
    throw new CollectionInputError(
      `${label} must be text up to ${limit} characters or null`,
    );
  }
  return value.trim() || null;
}

export function parseCollectionMcp(value: unknown): CollectionMcp {
  if (value === undefined) return { enabled: true, description: null };
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["enabled", "description"].includes(key),
    ) ||
    !("enabled" in value) ||
    typeof value.enabled !== "boolean"
  ) {
    throw new CollectionInputError(
      "mcp requires enabled (boolean) and an optional description",
    );
  }
  return {
    enabled: value.enabled,
    description: nullableText(
      "description" in value ? value.description : null,
      2000,
      "mcp.description",
    ),
  };
}
