import { AccessDeniedError } from "../permissions/access.js";
import type { collectionSchema } from "./schema-repository.js";
import { ItemError } from "./validation.js";
import { parseSearchQuery } from "./search.js";
import { parseItemFilters, type FilterGroup } from "./filter-input.js";
import type { Collection } from "../collections/types.js";
import type { Access } from "../permissions/access.js";

export interface ItemListQuery {
  fields?: unknown;
  page?: unknown;
  limit?: unknown;
  sort?: unknown;
  direction?: unknown;
  q?: unknown;
  filter?: unknown;
}

interface ParsedItemListQuery {
  page: number;
  limit: number;
  sort: string;
  direction: "asc" | "desc";
  offset: number;
  q: string;
  filters: FilterGroup;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new ItemError(`Invalid ${label}`, 400);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new ItemError(`Invalid ${label}`, 400);
  return number;
}

export function parseItemListQuery(
  query: ItemListQuery,
  name: string,
  schema: Awaited<ReturnType<typeof collectionSchema>>,
  allowed: string[],
  catalog: Collection[] = [],
  access?: Access,
): ParsedItemListQuery {
  const page = positiveInteger(query.page, 1, "page");
  const limit = positiveInteger(query.limit, 100, "limit");
  if (limit > 100 || (page - 1) * limit > 2_147_483_647) {
    throw new ItemError("Page is out of range", 400);
  }
  const { settings, fields } = schema;
  const sort = query.sort === undefined ? settings.primaryKey.name : query.sort;
  if (
    typeof sort !== "string" ||
    !(
      sort === settings.primaryKey.name ||
      fields.has(sort) ||
      (sort === "created_at" && settings.timestamps.createdAt) ||
      (sort === "updated_at" && settings.timestamps.updatedAt)
    )
  )
    throw new ItemError("Invalid sort field", 400);
  if (
    sort !== settings.primaryKey.name &&
    !allowed.includes("*") &&
    !allowed.includes(sort)
  ) {
    throw new AccessDeniedError();
  }
  const direction = query.direction === undefined ? "asc" : query.direction;
  if (direction !== "asc" && direction !== "desc") {
    throw new ItemError("Invalid sort direction", 400);
  }
  return {
    page,
    limit,
    sort,
    direction,
    offset: (page - 1) * limit,
    q: parseSearchQuery(query.q),
    filters: parseItemFilters(
      query.filter,
      name,
      schema,
      allowed,
      catalog,
      access,
    ),
  };
}
