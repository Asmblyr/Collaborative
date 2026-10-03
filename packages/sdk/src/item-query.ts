import type { ItemListOptions, ItemReadOptions } from "@asmblyr/contracts";

export function collectionPath(collection: string): string {
  if (typeof collection !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(collection)) {
    throw new TypeError("Invalid collection name");
  }
  return `/items/${collection}`;
}

export function itemPath(collection: string, id: string | number): string {
  if (typeof id !== "string" && (typeof id !== "number" || !Number.isSafeInteger(id))) {
    throw new TypeError("Item ID must be a string or a safe integer");
  }
  const key = String(id);
  if (!key || key === "." || key === "..") throw new TypeError("Invalid item ID path segment");
  return `${collectionPath(collection)}/${encodeURIComponent(key)}`;
}

function readQuery(options: ItemReadOptions): URLSearchParams {
  const query = new URLSearchParams();
  if (options.fields !== undefined) {
    if (
      !Array.isArray(options.fields) ||
      options.fields.some(
        (field) => typeof field !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(field),
      )
    ) {
      throw new TypeError("fields must contain physical field names");
    }
    query.set("fields", options.fields.join(","));
  }
  return query;
}

export function itemReadQuery(options: ItemReadOptions = {}): URLSearchParams {
  return readQuery(options);
}

export function itemListQuery(options: ItemListOptions = {}): URLSearchParams {
  const query = readQuery(options);
  for (const key of ["page", "limit"] as const) {
    const value = options[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`Invalid ${key}`);
    query.set(key, String(value));
  }
  for (const key of ["sort", "direction", "q"] as const) {
    const value = options[key];
    if (value !== undefined) query.set(key, value);
  }
  if (options.filter !== undefined) query.set("filter", JSON.stringify(options.filter));
  return query;
}
