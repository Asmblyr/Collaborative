import type { ItemListQuery } from "../items/list-query.js";
import { ItemError, parseCollectionName } from "../items/validation.js";

const readKeys = ["fields"];
const listKeys = [...readKeys, "page", "limit", "sort", "direction", "q", "filter"];

function optionsObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ItemError("Read options must be an object", 400);
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ItemError(`Unknown read option: ${key}`, 400);
  }
  return value as Record<string, unknown>;
}

function readFields(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((field) => typeof field !== "string")) {
    throw new ItemError("Fields must be an array of field names", 400);
  }
  return [...value];
}

function pageValue(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ItemError(`Invalid ${name}`, 400);
  }
  return String(value);
}

function filterValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ItemError("Filter must be a group", 400);
  }
  // The /items parser validates operators, depth, size, fields and related access.
  try {
    const json = JSON.stringify(value);
    if (typeof json === "string") return json;
  } catch {
    throw new ItemError("Filter must be JSON serializable", 400);
  }
  throw new ItemError("Filter must be a group", 400);
}

export function pluginCollectionName(value: unknown): string {
  if (typeof value !== "string") throw new ItemError("Invalid collection name", 400);
  return parseCollectionName(value);
}

export function pluginItemId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  throw new ItemError("Item ID must be a string or a safe integer", 400);
}

export function pluginReadFields(value: unknown): string[] | undefined {
  return readFields(optionsObject(value, readKeys).fields);
}

export function pluginListQuery(value: unknown): ItemListQuery {
  const options = optionsObject(value, listKeys);
  return {
    fields: readFields(options.fields),
    page: pageValue(options.page, "page"),
    limit: pageValue(options.limit, "limit"),
    sort: options.sort,
    direction: options.direction,
    q: options.q,
    filter: filterValue(options.filter),
  };
}
