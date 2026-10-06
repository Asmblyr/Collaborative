import type {
  ItemListResult,
  ItemResult,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import { requireGrant, type Access } from "../permissions/access.js";
import type { ItemListQuery } from "./list-query.js";
import { resolveRecordLabels } from "./record-labels.js";
import { getItem, listItems } from "./service.js";

/** Shared authorization boundary for HTTP and the request-bound plugin kit. */
export async function readItemList(
  database: Knex,
  access: Access,
  collection: string,
  query: ItemListQuery = {},
): Promise<ItemListResult> {
  const allowed = requireGrant(access, collection, "read");
  const result = await listItems(database, collection, allowed, query, access);
  return { ...result, labels: result.labels ?? {} };
}

export async function readItem(
  database: Knex,
  access: Access,
  collection: string,
  id: string,
  fields?: unknown,
): Promise<ItemResult> {
  const allowed = requireGrant(access, collection, "read");
  const data = await getItem(database, collection, id, allowed, fields, access);
  const labels = await resolveRecordLabels(database, collection, [id], access);
  return { data, label: Object.values(labels)[0] ?? id };
}
