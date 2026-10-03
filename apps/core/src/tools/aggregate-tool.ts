import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { listCollections } from "../collections/catalog-repository.js";
import { itemReadQuery } from "../items/read-query.js";
import { plainFilter } from "../items/filter-wire.js";
import { applyTerms } from "../terms/filters.js";
import { mcpCatalog } from "./collection-scope.js";
import { parseAggregateInput } from "./aggregate-input.js";
import { authorizeAggregateFields } from "./aggregate-fields.js";
import { aggregateQuery } from "./aggregate-query.js";
import { toolReadContext } from "./read-context.js";
import { aggregateGroupFilter } from "./aggregate-filter.js";
import { parseItemFilters } from "../items/filter-input.js";

export async function executeAggregateTool(
  db: Knex,
  access: Access,
  name: string,
  collectionId: string,
  args: unknown,
  signal?: AbortSignal,
): Promise<object> {
  const input = parseAggregateInput(args);
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
      const catalog = mcpCatalog(await listCollections(trx));
      const data = { schema, allowed, catalog };
      const groupTypes = authorizeAggregateFields(name, input, data, access);
      const applied = await applyTerms(
        trx,
        name,
        input.query.terms ?? [],
        input.query.filter,
        data,
        access,
      );
      const { query, options } = itemReadQuery(
        trx,
        name,
        schema,
        allowed,
        {
          q: input.query.q,
          filter: applied.filter,
        },
        catalog,
        access,
      );
      signal?.throwIfAborted();
      applyRowAccess(
        query,
        trx,
        access,
        name,
        "read",
        [
          ...input.groupBy,
          ...input.metrics.flatMap((metric) =>
            metric.field ? [metric.field] : [],
          ),
        ],
        name,
        schema.settings.primaryKey.name,
      );
      const result = await aggregateQuery(trx, query, name, input, groupTypes);
      signal?.throwIfAborted();
      const filter = plainFilter(options.filters);
      const groups = result.groups.map((group) => {
        let selectable = false;
        if (!group.truncatedFields.length) {
          try {
            parseItemFilters(
              JSON.stringify(aggregateGroupFilter(filter, group.values)),
              name,
              schema,
              allowed,
              catalog,
              access,
            );
            selectable = true;
          } catch {
            // Do not approximate a key or bypass ordinary filter complexity limits.
          }
        }
        return { ...group, selectable };
      });
      return {
        collection: name,
        collectionId,
        displayName: schema.settings.displayName || name,
        encoding: "text",
        groupBy: input.groupBy,
        metrics: input.metrics,
        conditions: {
          q: options.q,
          filter,
          appliedTerms: applied.appliedTerms,
        },
        sort: schema.settings.primaryKey.name,
        direction: "asc",
        ...result,
        groups,
        page: input.page,
        size: input.limit,
        orderBy: input.orderBy,
        semantics:
          "count(null field) counts rows; count(field)/count_distinct ignore NULL. sum/avg/min/max ignore NULL and return NULL when there are no values. Group NULL is separate from an empty string. Metrics cover all matching records, not just a data page. hasMore refers to groups, not records.",
      };
    },
    { readOnly: true },
  );
}
