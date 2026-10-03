import type { ItemField } from "./types.js";

export function databaseValues(values: Record<string, unknown>, fields: Map<string, ItemField>) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
    value !== null && ["json", "files"].includes(fields.get(key)?.type ?? "") ? JSON.stringify(value) : value]));
}
