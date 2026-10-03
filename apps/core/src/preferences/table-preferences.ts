import type { Knex } from "knex";
import {
  requireGrant,
  requireHuman,
  type Access,
} from "../permissions/access.js";
import { collectionSchema } from "../items/schema-repository.js";
import { AuthInputError } from "../auth/validation.js";
import { objectInput } from "../shared/input.js";
import { defaultTableView } from "./table-view-service.js";

interface Columns {
  order: string[];
  hidden: string[];
}
interface Sort {
  field: string;
  direction: "asc" | "desc";
}
const table = "asmblyr_table_preferences";

async function context(db: Knex, name: string, access: Access) {
  requireHuman(access);
  const grant = requireGrant(access, name, "read");
  const { settings, fields } = await collectionSchema(db, name);
  const readable = (field: string) =>
    grant.includes("*") || grant.includes(field);
  const names = [
    settings.primaryKey.name,
    ...[...fields.keys()].filter(readable),
    ...(settings.timestamps.createdAt && readable("created_at")
      ? ["created_at"]
      : []),
    ...(settings.timestamps.updatedAt && readable("updated_at")
      ? ["updated_at"]
      : []),
  ];
  return {
    names,
    id: settings.internalId,
    primaryKey: settings.primaryKey.name,
  };
}

function reconcile(columns: Columns | null, names: string[]): Columns | null {
  if (!columns) return null;
  const order = [
    ...new Set([
      ...columns.order.filter((name) => names.includes(name)),
      ...names,
    ]),
  ];
  const hidden = [
    ...new Set(columns.hidden.filter((name) => names.includes(name))),
  ];
  return { order, hidden: hidden.length >= order.length ? [] : hidden };
}

export async function getTablePreferences(
  db: Knex,
  name: string,
  access: Access,
) {
  const ctx = await context(db, name, access);
  const row = await db(table)
    .where({ user_id: access.principal.id, collection_id: ctx.id })
    .first<{ columns: Columns | null; page_size: number; sort: Sort | null }>();
  const defaults = (await defaultTableView(db, name, access))?.definition;
  const sort =
    row?.sort && ctx.names.includes(row.sort.field)
      ? row.sort
      : (defaults?.sort ?? { field: ctx.primaryKey, direction: "asc" });
  return {
    collectionId: ctx.id,
    hasSaved: Boolean(row),
    columns: reconcile(row?.columns ?? defaults?.columns ?? null, ctx.names),
    pageSize: row?.page_size ?? defaults?.pageSize ?? 25,
    sort,
  };
}

export async function saveTablePreferences(
  db: Knex,
  name: string,
  access: Access,
  value: unknown,
) {
  const body = objectInput(value, ["columns", "pageSize", "sort"]);
  const ctx = await context(db, name, access);
  const update: Record<string, unknown> = {};
  if ("columns" in body) {
    const columns = objectInput(body.columns, ["order", "hidden"]);
    for (const key of ["order", "hidden"]) {
      const list = columns[key];
      if (
        !Array.isArray(list) ||
        list.length > 500 ||
        list.some((v) => typeof v !== "string" || !ctx.names.includes(v))
      ) {
        throw new AuthInputError("Invalid or inaccessible table columns");
      }
    }
    update.columns = JSON.stringify(
      reconcile(columns as unknown as Columns, ctx.names),
    );
  }
  if ("pageSize" in body) {
    if (
      typeof body.pageSize !== "number" ||
      ![10, 25, 50, 100].includes(body.pageSize)
    )
      throw new AuthInputError("Invalid page size");
    update.page_size = body.pageSize;
  }
  if ("sort" in body) {
    const sort = objectInput(body.sort, ["field", "direction"]);
    if (
      typeof sort.field !== "string" ||
      !ctx.names.includes(sort.field) ||
      typeof sort.direction !== "string" ||
      !["asc", "desc"].includes(sort.direction)
    ) {
      throw new AuthInputError("Invalid or inaccessible sort field");
    }
    update.sort = JSON.stringify(sort);
  }
  if (!Object.keys(update).length)
    throw new AuthInputError("No preferences supplied");
  // Merge only supplied properties: changing page size must not overwrite another tab's columns.
  await db(table)
    .insert({ user_id: access.principal.id, collection_id: ctx.id, ...update })
    .onConflict(["user_id", "collection_id"])
    .merge(update);
  return getTablePreferences(db, name, access);
}
