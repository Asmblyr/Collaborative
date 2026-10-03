import { parseItemFilters } from "../items/filter-input.js";
import { plainFilter } from "../items/filter-wire.js";
import { ItemError } from "../items/validation.js";
import type { Access } from "../permissions/access.js";
import type { CollectionData } from "./collection-data.js";

export function validateToolFilter(
  name: string,
  value: unknown,
  data: CollectionData,
  access: Access,
) {
  if (typeof value !== "string" || value.length > 8192) {
    throw new ItemError("Invalid filter", 400);
  }
  const filter = parseItemFilters(value, name, data.schema, data.allowed, data.catalog, access);
  return {
    collection: name,
    displayName: data.schema.settings.displayName || name,
    collectionId: data.schema.settings.internalId,
    filter: plainFilter(filter),
  };
}
