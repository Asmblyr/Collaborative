import type { Collection } from "../collections/types.js";
import { ItemError } from "../items/validation.js";

/** MCP exposure is an additional boundary, including for superusers. */
export function requireMcpCollection(settings: { mcp?: { enabled: boolean } }) {
  if (settings.mcp?.enabled === false)
    throw new ItemError("Collection is not available to MCP", 403);
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
          (enabled.has(field.relation.collection) &&
            (field.relation.kind === "m2o" ||
              enabled.has(field.relation.throughCollection))),
      ),
    }));
}
