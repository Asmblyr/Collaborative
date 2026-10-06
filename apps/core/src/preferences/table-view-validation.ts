import type { Knex } from "knex";
import { collectionSchema } from "../items/schema-repository.js";
import { listCollections } from "../collections/catalog-repository.js";
import {
  requireGrant,
  requireHuman,
  type Access,
} from "../permissions/access.js";
import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { parseItemListQuery } from "../items/list-query.js";
import { plainFilter, storedFilterInput } from "../items/filter-wire.js";
import { columnWidths } from "./column-widths.js";

export async function viewContext(db: Knex, name: string, access: Access) {
  requireHuman(access);
  const allowed = requireGrant(access, name, "read");
  const [schema, catalog] = await Promise.all([
    collectionSchema(db, name),
    listCollections(db),
  ]);
  const readable = (field: string) =>
    allowed.includes("*") || allowed.includes(field);
  const names = [
    schema.settings.primaryKey.name,
    ...[...schema.fields.keys()].filter(readable),
    ...(schema.settings.timestamps.createdAt && readable("created_at")
      ? ["created_at"]
      : []),
    ...(schema.settings.timestamps.updatedAt && readable("updated_at")
      ? ["updated_at"]
      : []),
  ];
  return {
    schema,
    catalog,
    allowed,
    names,
    id: schema.settings.internalId,
    name,
    access,
  };
}

export function validateView(
  value: unknown,
  ctx: Awaited<ReturnType<typeof viewContext>>,
  reconcile = false,
) {
  const body = objectInput(value, [
    "columns",
    "sort",
    "pageSize",
    "filter",
    "q",
  ]);
  const columns = objectInput(body.columns, ["order", "hidden", "widths"]);
  const widths = columnWidths(columns.widths, ctx.names, reconcile);
  const sort = objectInput(body.sort, ["field", "direction", "order"]);
  const lists: Record<string, string[]> = {};
  for (const key of ["order", "hidden"]) {
    const list = columns[key];
    if (
      !Array.isArray(list) ||
      list.length > 500 ||
      list.some(
        (v) => typeof v !== "string" || (!reconcile && !ctx.names.includes(v)),
      )
    ) {
      throw new ItemError("Invalid or inaccessible table columns", 400);
    }
    lists[key] = [
      ...new Set((list as string[]).filter((v) => ctx.names.includes(v))),
    ];
  }
  if (![10, 25, 50, 100].includes(body.pageSize as number))
    throw new ItemError("Invalid page size", 400);
  const field =
    reconcile && !ctx.names.includes(sort.field as string)
      ? ctx.schema.settings.primaryKey.name
      : sort.field;
  const query = parseItemListQuery(
    {
      sort: field,
      order: sort.order ?? "field",
      direction: sort.direction,
      limit: String(body.pageSize),
      q: body.q,
      filter:
        body.filter == null
          ? undefined
          : JSON.stringify(
              reconcile ? storedFilterInput(body.filter) : body.filter,
            ),
    },
    ctx.name,
    ctx.schema,
    ctx.allowed,
    ctx.catalog,
    ctx.access,
  );
  const order = [...new Set([...lists.order, ...ctx.names])];
  const hidden = lists.hidden.length >= order.length ? [] : lists.hidden;
  return {
    columns: { order, hidden, ...widths },
    sort: {
      field: query.sort,
      direction: query.direction,
      ...(sort.order === undefined
        ? {}
        : { order: sort.order === "relevance" ? "relevance" : "field" }),
    },
    pageSize: query.limit,
    filter: query.filters.children.length ? plainFilter(query.filters) : null,
    q: query.q,
  };
}
