import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  AssistantSelection,
  AssistantSelectionQuery,
} from "@asmblyr-collaborative/contracts";
import type { Access } from "../permissions/access.js";
import {
  collectionData,
  toolCollectionName,
} from "../tools/collection-data.js";
import { objectInput } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import { ItemError } from "../items/validation.js";
import { parseItemListQuery } from "../items/list-query.js";
import { plainFilter } from "../items/filter-wire.js";

/** Only successful server tool results can become selectable cards. */
export function captureSelection(
  tool: string,
  result: object,
): AssistantSelection | null {
  if (tool !== "search_items" && tool !== "count_items") return null;
  const value = result as Record<string, unknown>;
  const conditions = value.conditions as Record<string, unknown> | undefined;
  if (
    typeof value.collection !== "string" ||
    typeof value.collectionId !== "string" ||
    typeof value.displayName !== "string" ||
    typeof value.sort !== "string" ||
    (value.direction !== "asc" && value.direction !== "desc") ||
    !conditions ||
    typeof conditions.q !== "string" ||
    !conditions.filter ||
    typeof conditions.filter !== "object"
  )
    return null;
  return {
    type: "selection",
    resultId: randomUUID(),
    collection: value.collection,
    collectionId: value.collectionId,
    displayName: value.displayName,
    q: conditions.q,
    filter: conditions.filter,
    sort: value.sort,
    direction: value.direction,
    ...(value.order === "field" || value.order === "relevance"
      ? { order: value.order }
      : {}),
    count: typeof value.count === "string" ? value.count : null,
  };
}

/** Click-time validation uses current permissions, MCP settings and collection identity. */
export async function validateSelection(
  db: Knex,
  access: Access,
  input: unknown,
): Promise<AssistantSelectionQuery> {
  const body = objectInput(input, [
    "collection",
    "collectionId",
    "q",
    "filter",
    "sort",
    "direction",
    "order",
  ]);
  const name = toolCollectionName(body.collection);
  const data = await collectionData(db, access, name);
  if (data.schema.settings.internalId !== parseId(body.collectionId)) {
    throw new ItemError("Коллекция изменилась. Запросите новую подборку.", 409);
  }
  if (
    !body.filter ||
    typeof body.filter !== "object" ||
    Array.isArray(body.filter)
  ) {
    throw new ItemError("Filter group required", 400);
  }
  const query = parseItemListQuery(
    {
      q: body.q,
      filter: JSON.stringify(body.filter),
      sort: body.sort,
      direction: body.direction,
      order: body.order,
    },
    name,
    data.schema,
    data.allowed,
    data.catalog,
    access,
  );
  return {
    collection: name,
    q: query.q,
    filter: plainFilter(query.filters),
    sort: query.sort,
    order: query.order,
    direction: query.direction as AssistantSelection["direction"],
  };
}
