import type { Access } from "../permissions/access.js";
import { isDeepStrictEqual } from "node:util";
import type { Knex } from "knex";
import type { HookEvents } from "@asmblyr/kit";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { ItemError, parseCollectionName, parseItemId } from "./validation.js";

type JsonRow = Record<string, unknown>;
type EventAction = "create" | "update" | "delete";

export interface MutationContext {
  requestId: string;
  access?: Access;
  actor: { kind: "user" | "service"; id: string };
  /** Original locked rows within one atomic draft, including repeated references. */
  expectedSnapshots?: Map<string, Record<string, unknown>>;
  onItemEvent?: (
    transaction: Knex.Transaction,
    event: `items.${EventAction}`,
    target: HookEvents["items.create"],
  ) => Promise<void>;
}

function jsonRow(row: Record<string, unknown>): JsonRow {
  return JSON.parse(
    JSON.stringify(row, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as JsonRow;
}

export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const oldRow = jsonRow(before);
  const newRow = jsonRow(after);
  const oldValues: JsonRow = {};
  const newValues: JsonRow = {};
  for (const key of new Set([...Object.keys(oldRow), ...Object.keys(newRow)])) {
    if (!isDeepStrictEqual(oldRow[key], newRow[key])) {
      oldValues[key] = oldRow[key];
      newValues[key] = newRow[key];
    }
  }
  return { before: oldValues, after: newValues };
}

export async function recordItemEvent(
  transaction: Knex.Transaction,
  collection: { id: string; name: string; itemId: string },
  action: EventAction,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  context: MutationContext,
): Promise<void> {
  await transaction("asmblyr_item_events")
    .withSchema("public")
    .insert({
      collection_id: collection.id,
      collection_name: collection.name,
      item_id: collection.itemId,
      action,
      actor_kind: context.actor.kind,
      actor_id: context.actor.id,
      request_id: context.requestId,
      before: before === null ? null : jsonRow(before),
      after: after === null ? null : jsonRow(after),
    });
  await context.onItemEvent?.(transaction, `items.${action}`, {
    collection: collection.name,
    collectionId: collection.id,
    itemId: collection.itemId,
  });
}

export async function listItemEvents(
  database: Knex,
  name: string,
  query: { item?: unknown; limit?: unknown; before?: unknown },
) {
  parseCollectionName(name);
  const settings = await findCollectionSettings(database, name);
  if (!settings) {
    throw new ItemError(`Collection not found: ${name}`, 404);
  }
  if (query.item !== undefined && typeof query.item !== "string") {
    throw new ItemError("Invalid item id", 400);
  }
  const itemId =
    query.item === undefined
      ? undefined
      : parseItemId(query.item, settings.primaryKey.type);
  if (
    query.limit !== undefined &&
    (typeof query.limit !== "string" || !/^[1-9]\d*$/.test(query.limit))
  ) {
    throw new ItemError("limit must be between 1 and 100", 400);
  }
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ItemError("limit must be between 1 and 100", 400);
  }
  if (
    query.before !== undefined &&
    (typeof query.before !== "string" ||
      !/^[1-9]\d*$/.test(query.before) ||
      BigInt(query.before) > 9223372036854775807n)
  ) {
    throw new ItemError("Invalid history cursor", 400);
  }

  const events = await database("asmblyr_item_events")
    .withSchema("public")
    .select(
      "id",
      "item_id",
      "action",
      "occurred_at",
      "actor_kind",
      "actor_id",
      "request_id",
      "before",
      "after",
    )
    .where({ collection_id: settings.internalId })
    .modify((builder) => {
      if (itemId !== undefined) {
        builder.where("item_id", itemId);
      }
      if (query.before !== undefined) {
        builder.where("id", "<", query.before);
      }
    })
    .orderBy("id", "desc")
    .limit(limit + 1);
  const hasMore = events.length > limit;
  const data = events.slice(0, limit);
  return {
    data,
    nextCursor: hasMore ? String(data[data.length - 1].id) : null,
  };
}
