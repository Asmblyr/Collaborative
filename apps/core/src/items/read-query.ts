import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import type { Collection } from "../collections/types.js";
import type { Access } from "../permissions/access.js";
import type { collectionSchema } from "./schema-repository.js";
import { parseItemListQuery, type ItemListQuery } from "./list-query.js";
import { applyItemSearch, searchableColumns } from "./search.js";
import { relationSearchPaths } from "./relation-search.js";
import { applyItemFilters } from "./filter-query.js";

// Shared predicates for the table API and assistant reads/counts. Projection,
// ordering and pagination belong to the caller; permissions never come from AI.
export function itemReadQuery(
  database: Knex,
  name: string,
  schema: Awaited<ReturnType<typeof collectionSchema>>,
  allowed: string[],
  input: ItemListQuery,
  catalog: Collection[],
  access?: Access,
) {
  const options = parseItemListQuery(
    input,
    name,
    schema,
    allowed,
    catalog,
    access,
  );
  const searchable = searchableColumns(
    schema.settings.primaryKey.name,
    schema.fields.values(),
    allowed,
  );
  const current = catalog.find((entry) => entry.name === name);
  const relations =
    current && access
      ? relationSearchPaths(current, catalog, access, allowed)
      : [];
  const referenced: string[] = [options.sort];
  function fields(node: import("./filter-input.js").FilterNode) {
    if ("logic" in node) node.children.forEach(fields);
    else referenced.push(node.field.split(".")[0]!);
  }
  fields(options.filters);
  const query = database(name)
    .withSchema("public")
    .modify((builder) =>
      applyRowAccess(
        builder,
        database,
        access,
        name,
        "read",
        referenced,
        name,
        schema.settings.primaryKey.name,
      ),
    )
    .modify((builder) =>
      applyItemSearch(
        builder,
        searchable,
        options.q,
        schema.settings.primaryKey.type,
        database,
        relations,
        access,
        name,
      ),
    )
    .modify((builder) =>
      applyItemFilters(builder, options.filters, database, name),
    );
  return { query, options };
}
