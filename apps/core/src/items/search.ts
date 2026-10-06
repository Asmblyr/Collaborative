import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { grantFor } from "../permissions/access.js";
import { listCollections } from "../collections/catalog-repository.js";
import { ItemError } from "./validation.js";
import { recordLabelPlan } from "./record-label.js";
import { relationSearchPaths } from "./relation-search.js";
import { prepareItemSearch, applySearchPlan } from "./search-plan.js";
import { searchPriorities } from "../collections/search-priority.js";
import { resolveRecordLabels } from "./record-labels.js";

export function parseSearchQuery(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string")
    throw new ItemError("Invalid search query", 400);
  const query = value.trim();
  if (query.length > 100) throw new ItemError("Search query is too long", 400);
  return query;
}

export function searchableColumns(
  primaryKey: string,
  fields: Iterable<{
    name: string;
    type: string | null;
    searchable?: boolean;
    presentation?: { sensitive?: boolean };
  }>,
  allowed: string[],
): string[] {
  return [
    primaryKey,
    ...Array.from(fields)
      .filter(
        (field) =>
          (field.type === "text" || field.type === "email") &&
          field.searchable !== false &&
          !field.presentation?.sensitive &&
          (allowed.includes("*") || allowed.includes(field.name)),
      )
      .map((field) => field.name),
  ];
}

export interface SearchResults {
  collections: { name: string; displayName?: string | null }[];
  items: { collection: string; id: string; label: string }[];
}

export async function searchAll(
  database: Knex,
  access: Access,
  query: string,
): Promise<SearchResults> {
  if (!query) return { collections: [], items: [] };
  const catalog = await listCollections(database);
  const navigable = catalog.filter((collection) => !collection.hidden);
  const collections = navigable
    .filter(
      (collection) =>
        (["read", "create", "update", "delete"] as const).some((action) =>
          grantFor(access, collection.name, action),
        ) &&
        [collection.name, collection.displayName ?? ""].some((name) =>
          name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        ),
    )
    .slice(0, 20)
    .map((collection) => ({
      name: collection.name,
      displayName: collection.displayName,
    }));
  const readable = navigable.flatMap((collection) => {
    const allowed = grantFor(access, collection.name, "read");
    return allowed ? [{ collection, allowed }] : [];
  });
  const items: SearchResults["items"] = [];
  // Keep the number of concurrent table scans bounded for large catalogs.
  for (
    let index = 0;
    index < readable.length && items.length < 20;
    index += 4
  ) {
    const batch = readable.slice(index, index + 4);
    const matches = await Promise.all(
      batch.map(async ({ collection, allowed }) => {
        const key = collection.primaryKey.name;
        const columns = searchableColumns(key, collection.fields, allowed);
        const labels = recordLabelPlan(collection, collection.fields, allowed);
        const relations = relationSearchPaths(
          collection,
          catalog,
          access,
          allowed,
        );
        const plan = prepareItemSearch(
          database,
          columns,
          query,
          collection.primaryKey.type,
          relations,
          access,
          collection.name,
          searchPriorities(collection, collection.fields),
        );
        const rows = await database(collection.name)
          .withSchema("public")
          .select([...new Set([...columns, ...labels.columns])])
          .modify((builder) => applySearchPlan(builder, plan))
          .modify((builder) =>
            applyRowAccess(builder, database, access, collection.name),
          )
          .orderByRaw("(?) ASC", [plan.rank])
          .orderBy(key)
          .limit(5);
        const resolved = await resolveRecordLabels(
          database,
          collection.name,
          rows.map((row: Record<string, unknown>) => String(row[key])),
          access,
          catalog,
        );
        return rows.map((row: Record<string, unknown>) => {
          return {
            collection: collection.name,
            id: String(row[key]),
            label: resolved[String(row[key])] ?? String(row[key]),
          };
        });
      }),
    );
    items.push(...matches.flat());
  }
  return { collections, items: items.slice(0, 20) };
}
