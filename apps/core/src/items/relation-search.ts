import { searchPriorities } from "../collections/search-priority.js";
import type { Knex } from "knex";
import type { Collection } from "../collections/types.js";
import { grantFor, type Access } from "../permissions/access.js";

export interface RelationSearchPath {
  kind: "m2o" | "o2m" | "m2m";
  sourceField: string;
  sourceKey: string;
  targetCollection: string;
  targetKey: string;
  targetFields: string[];
  targetPriorities?: Record<string, boolean>;
  throughCollection?: string;
  throughField?: string;
  relatedField?: string;
}

export function relationSearchPaths(
  source: Collection,
  catalog: Collection[],
  access: Access,
  sourceAllowed: string[],
): RelationSearchPath[] {
  const paths: RelationSearchPath[] = [];
  for (const field of source.fields) {
    if (
      field.searchable !== true ||
      field.presentation?.sensitive ||
      !field.relation ||
      (!sourceAllowed.includes("*") && !sourceAllowed.includes(field.name))
    )
      continue;
    const target = catalog.find(
      (entry) => entry.name === field.relation?.collection,
    );
    if (!target) continue;
    const allowed = grantFor(access, target.name, "read");
    if (!allowed) continue;
    const targetFields = target.fields
      .filter(
        (entry) =>
          (entry.type === "text" || entry.type === "email") &&
          entry.searchable !== false &&
          !entry.presentation?.sensitive &&
          (allowed.includes("*") || allowed.includes(entry.name)),
      )
      .map((entry) => entry.name);
    if (targetFields.length === 0) continue;
    const relation = field.relation;
    // Until related permission operands are supported, omit conditional relation
    // search paths rather than allowing an EXISTS side channel through private rows.
    if (
      access.rowRules?.has(`${source.name}:read`) ||
      access.rowRules?.has(`${target.name}:read`) ||
      (relation.kind !== "m2o" &&
        access.rowRules?.has(`${relation.throughCollection}:read`))
    )
      continue;
    if (
      relation.kind === "o2m" &&
      !allowed.includes("*") &&
      !allowed.includes(relation.throughField)
    )
      continue;
    paths.push({
      kind: relation.kind,
      sourceField: field.name,
      sourceKey: source.primaryKey.name,
      targetCollection: target.name,
      targetKey: target.primaryKey.name,
      targetFields,
      targetPriorities: Object.fromEntries(
        [...searchPriorities(target, target.fields)].map(([name, primary]) => [
          name,
          field.searchPriority ? field.searchPriority === "primary" : primary,
        ]),
      ),
      ...(relation.kind !== "m2o"
        ? {
            throughCollection: relation.throughCollection,
            throughField: relation.throughField,
            ...(relation.kind === "m2m"
              ? { relatedField: relation.relatedField }
              : {}),
          }
        : {}),
    });
  }
  return paths;
}

export function relationSearchQuery(
  database: Knex,
  path: RelationSearchPath,
  pattern: string,
  relatedAlias = "related",
  bridgeAlias = "bridge",
): Knex.QueryBuilder {
  const matched =
    path.kind === "m2m"
      ? database({ [bridgeAlias]: `public.${path.throughCollection}` })
          .join(
            { [relatedAlias]: `public.${path.targetCollection}` },
            `${bridgeAlias}.${path.relatedField}`,
            `${relatedAlias}.${path.targetKey}`,
          )
          .select(`${bridgeAlias}.${path.throughField}`)
      : database({ [relatedAlias]: `public.${path.targetCollection}` }).select(
          path.kind === "o2m"
            ? `${relatedAlias}.${path.throughField}`
            : `${relatedAlias}.${path.targetKey}`,
        );
  matched.where((target) => {
    for (const field of path.targetFields) {
      target.orWhereRaw("lower(??) LIKE lower(?) ESCAPE E'\\\\'", [
        `${relatedAlias}.${field}`,
        pattern,
      ]);
    }
  });
  return matched;
}
