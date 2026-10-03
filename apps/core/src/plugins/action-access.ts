import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";

interface RelationEffect {
  source_collection: string;
  target_collection: string;
  on_delete: "cascade" | "setNull" | "setDefault";
}

/** Block deletion when its configured FK effects can reach a non-MCP collection. */
function blockedDeletes(relations: RelationEffect[], enabled: Set<string>): Set<string> {
  const blocked = new Set<string>();
  const cascadeParents = new Map<string, Set<string>>();
  for (const relation of relations) {
    if (!enabled.has(relation.source_collection)) blocked.add(relation.target_collection);
    if (relation.on_delete === "cascade") {
      const parents = cascadeParents.get(relation.source_collection) ?? new Set<string>();
      parents.add(relation.target_collection);
      cascadeParents.set(relation.source_collection, parents);
    }
  }
  // Set iteration visits newly added parents, and terminates even on cyclic relations.
  for (const collection of blocked) {
    for (const parent of cascadeParents.get(collection) ?? []) blocked.add(parent);
  }
  return blocked;
}

/** Intersect all data operations with MCP exposure, also for superusers and related paths. */
export async function mcpActionAccess(database: Knex, access: Access): Promise<Access> {
  const [rows, relations] = await Promise.all([
    database<{ name: string }>("asmblyr_collections")
      .withSchema("public")
      .where("mcp_enabled", true)
      .select("name"),
    database<RelationEffect>("asmblyr_relations")
      .withSchema("public")
      .whereIn("on_delete", ["cascade", "setNull", "setDefault"])
      .select("source_collection", "target_collection", "on_delete"),
  ]);
  const enabled = new Set(rows.map((row) => row.name));
  const grants = new Map<string, string[]>();
  if (access.principal.superuser) {
    for (const collection of enabled) {
      for (const action of ["read", "create", "update", "delete"]) {
        grants.set(`${collection}:${action}`, ["*"]);
      }
    }
  } else {
    for (const [key, fields] of access.grants) {
      const collection = key.slice(0, key.lastIndexOf(":"));
      if (enabled.has(collection)) grants.set(key, fields);
    }
  }
  // Conservative schema guard: no row/existence probe in a collection hidden from MCP.
  for (const collection of blockedDeletes(relations, enabled)) {
    grants.delete(`${collection}:delete`);
  }
  return { principal: { ...access.principal, superuser: false }, grants };
}
