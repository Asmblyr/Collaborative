import {
  applyRowAccess,
  selectRowPermissions,
  projectRow,
} from "../permissions/row-access.js";
import { dataProjection } from "./data-projection.js";
import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { listCollections } from "../collections/catalog-repository.js";
import { itemReadQuery } from "../items/read-query.js";
import { plainFilter } from "../items/filter-wire.js";
import { parseItemId } from "../items/validation.js";
import { parseDataToolInput, type DataTool } from "./data-tool-input.js";
import { mcpCatalog } from "./collection-scope.js";
import { toolReadContext } from "./read-context.js";
import { applyTerms } from "../terms/filters.js";

export const dataCellChars = 2000;
const resultChars = 18000;
type PreviewRow = Record<string, string | null>;

function previews(rows: PreviewRow[], primaryKey: string) {
  // Allocate across all rows/columns so page boundaries remain stable. Never
  // silently drop a row when a large cell consumes the output budget.
  const cells = rows.reduce((n, row) => n + Object.keys(row).length, 0);
  const cellLimit = Math.min(
    dataCellChars,
    Math.floor((resultChars - rows.length * 255) / Math.max(cells, 1)),
  );
  return rows.map((row) => {
    const truncatedFields: string[] = [];
    const values = Object.fromEntries(
      Object.entries(row).map(([field, value]) => {
        if (
          field !== primaryKey &&
          value !== null &&
          value.length > cellLimit
        ) {
          truncatedFields.push(field);
          return [field, value.slice(0, cellLimit)];
        }
        return [field, value];
      }),
    );
    return { values, truncatedFields };
  });
}

export async function executeDataTool(
  db: Knex,
  access: Access,
  name: string,
  collectionId: string,
  tool: DataTool,
  args: unknown,
  signal?: AbortSignal,
): Promise<object> {
  signal?.throwIfAborted();
  return db.transaction(
    async (trx) => {
      const { schema, allowed } = await toolReadContext(
        trx,
        access,
        name,
        collectionId,
        signal,
      );
      const input = parseDataToolInput(tool, args, {
        q: "",
        filter: "",
        sort: schema.settings.primaryKey.name,
        direction: "asc",
      });
      signal?.throwIfAborted();
      const key = schema.settings.primaryKey;
      const displayName = schema.settings.displayName || name;
      const selected =
        input.tool === "count_items"
          ? []
          : dataProjection(schema, allowed, input.fields);
      // Truncate in PostgreSQL: large JSON/text cells never reach the Node heap
      // in full. Text encoding also preserves bigint/numeric precision exactly.
      const columns = selected.map((field) =>
        trx.raw("left(??::text, ?) as ??", [field, dataCellChars + 1, field]),
      );
      if (input.tool === "read_item") {
        const row = await trx(name)
          .withSchema("public")
          .where(key.name, parseItemId(input.id, key.type))
          .select(columns)
          .modify((query) => {
            applyRowAccess(query, trx, access, name);
            selectRowPermissions(query, trx, access, name);
          })
          .first();
        signal?.throwIfAborted();
        return {
          collection: name,
          displayName,
          encoding: "text",
          found: Boolean(row),
          item: row
            ? previews(
                [projectRow(row, access, name, key.name) as PreviewRow],
                key.name,
              )[0]
            : null,
        };
      }
      const catalog = mcpCatalog(await listCollections(trx));
      const { terms = [], ...requestedQuery } = input.query;
      const applied = await applyTerms(
        trx,
        name,
        terms,
        requestedQuery.filter,
        { schema, catalog, allowed },
        access,
      );
      const { query, options, order } = itemReadQuery(
        trx,
        name,
        schema,
        allowed,
        { ...requestedQuery, filter: applied.filter },
        catalog,
        access,
      );
      const conditions = {
        q: options.q,
        filter: plainFilter(options.filters),
        appliedTerms: applied.appliedTerms,
      };
      const selection = {
        collectionId,
        sort: options.sort,
        order: options.order,
        direction: options.direction,
      };
      signal?.throwIfAborted();
      if (tool === "count_items") {
        const count = await query
          .count<{ total: string }>("* as total")
          .first();
        signal?.throwIfAborted();
        return {
          collection: name,
          displayName,
          conditions,
          ...selection,
          count: count?.total ?? "0",
        };
      }
      // Qualify source columns: ORDER BY an output alias would sort the text
      // preview lexically instead of respecting the underlying numeric/date type.
      const rows: PreviewRow[] = await query
        .select(columns)
        .modify((builder) => selectRowPermissions(builder, trx, access, name))
        .modify(order)
        .limit(options.limit + 1)
        .offset(options.offset);
      signal?.throwIfAborted();
      return {
        collection: name,
        displayName,
        encoding: "text",
        conditions,
        ...selection,
        items: previews(
          rows
            .slice(0, options.limit)
            .map(
              (row) => projectRow(row, access, name, key.name) as PreviewRow,
            ),
          key.name,
        ),
        page: options.page,
        size: options.limit,
        sort: options.sort,
        order: options.order,
        direction: options.direction,
        hasMore: rows.length > options.limit,
        pageLimit: 50,
      };
    },
    { readOnly: true },
  );
}
