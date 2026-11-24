import type { Collection } from "../collections/types.js";
import type { Access } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";

/** MCP exposure is an additional boundary, including for superusers. */
export function requireMcpCollection(settings: { mcp?: { enabled: boolean } }) {
  if (settings.mcp?.enabled === false) {
    throw new ItemError("Collection is not available to assistant tools", 403);
  }
}

export function isRowScopedRead(access: Access, collection: string): boolean {
  return (
    !access.principal.superuser &&
    Boolean(access.rowRules?.has(`${collection}:read`))
  );
}

function isSystemUserRelation(field: Collection["fields"][number]): boolean {
  return (
    field.relation?.kind === "m2o" && field.relation.collection === "@users"
  );
}

export function mcpCatalog(catalog: Collection[]): Collection[] {
  const enabled = new Set(
    catalog.filter((c) => c.mcp?.enabled !== false).map((c) => c.name),
  );
  return catalog
    .filter((c) => enabled.has(c.name))
    .map((c) => ({
      ...c,
      fields: c.fields.filter(
        (field) =>
          !field.relation ||
          isSystemUserRelation(field) ||
          (enabled.has(field.relation.collection) &&
            (field.relation.kind === "m2o" ||
              enabled.has(field.relation.throughCollection))),
      ),
    }));
}
