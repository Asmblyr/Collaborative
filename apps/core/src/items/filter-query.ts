import type { Knex } from "knex";
import type { FilterGroup, FilterNode, ItemFilter } from "./filter-input.js";

function likePattern(value: string, position: "any" | "start" | "end"): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
  return `${position === "start" ? "" : "%"}${escaped}${position === "end" ? "" : "%"}`;
}

function applyScalar(
  where: Knex.QueryBuilder,
  column: string,
  filter: ItemFilter,
): void {
  const { op, value } = filter;
  if (op === "isNull") where.whereNull(column);
  else if (op === "notNull") where.whereNotNull(column);
  else if (op === "isEmpty") where.where(column, "");
  else if (op === "notEmpty") where.whereNot(column, "");
  else if (
    op.toLowerCase().includes("contains") ||
    op.toLowerCase().includes("startswith") ||
    op.toLowerCase().includes("endswith")
  ) {
    const lower = op.toLowerCase();
    const position = lower.includes("startswith")
      ? "start"
      : lower.includes("endswith")
        ? "end"
        : "any";
    const comparison = lower.startsWith("not") ? "NOT LIKE" : "LIKE";
    const expression = op.endsWith("Case")
      ? `?? ${comparison} ?`
      : `lower(??) ${comparison} lower(?)`;
    where.whereRaw(`${expression} ESCAPE E'\\\\'`, [
      column,
      likePattern(String(value), position),
    ]);
  } else if (op === "in" || op === "notIn") {
    if (op === "in")
      where.whereIn(column, value as Array<string | number | boolean>);
    else where.whereNotIn(column, value as Array<string | number | boolean>);
  } else if (op === "between" || op === "notBetween") {
    const bounds = value as [
      string | number | boolean,
      string | number | boolean,
    ];
    if (op === "between") where.whereBetween(column, bounds);
    else where.whereNotBetween(column, bounds);
  } else {
    const comparisons: Record<string, string> = {
      eq: "=",
      neq: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    };
    const comparison = comparisons[op];
    if (!comparison) throw new Error("Unsupported filter operator");
    where.where(column, comparison, value as string | number | boolean);
  }
}

function applyCondition(
  where: Knex.QueryBuilder,
  filter: ItemFilter,
  database: Knex,
  sourceName: string,
): void {
  const relation = filter.resolved.relation;
  if (!relation) {
    applyScalar(where, filter.resolved.column, filter);
    return;
  }
  // Collection names start with a letter; internal aliases start with an underscore.
  const related = `public.${relation.targetCollection}`;
  let matched: Knex.QueryBuilder;
  if (relation.kind === "m2m") {
    matched = database({
      _asmblyr_bridge: `public.${relation.throughCollection}`,
    })
      .join(
        { _asmblyr_related: related },
        `_asmblyr_bridge.${relation.relatedField}`,
        `_asmblyr_related.${relation.targetKey}`,
      )
      .select(database.raw("1"))
      .whereRaw("?? = ??", [
        `_asmblyr_bridge.${relation.throughField}`,
        `${sourceName}.${relation.sourceKey}`,
      ]);
  } else {
    const targetColumn =
      relation.kind === "m2o" ? relation.targetKey : relation.throughField;
    const sourceColumn =
      relation.kind === "m2o" ? relation.sourceField : relation.sourceKey;
    matched = database({ _asmblyr_related: related })
      .select(database.raw("1"))
      .whereRaw("?? = ??", [
        `_asmblyr_related.${targetColumn}`,
        `${sourceName}.${sourceColumn}`,
      ]);
  }
  if (filter.op !== "exists" && filter.op !== "notExists") {
    applyScalar(matched, `_asmblyr_related.${filter.resolved.column}`, filter);
  }
  if (filter.op === "notExists" || filter.quantifier === "none")
    where.whereNotExists(matched);
  else where.whereExists(matched);
}

function applyNode(
  where: Knex.QueryBuilder,
  node: FilterNode,
  database: Knex,
  sourceName: string,
): void {
  if ("logic" in node) {
    for (const child of node.children) {
      if (node.logic === "or") {
        where.orWhere((nested) =>
          applyNode(nested, child, database, sourceName),
        );
      } else {
        where.where((nested) => applyNode(nested, child, database, sourceName));
      }
    }
  } else applyCondition(where, node, database, sourceName);
}

export function applyItemFilters(
  builder: Knex.QueryBuilder,
  filters: FilterGroup,
  database: Knex,
  sourceName: string,
): void {
  if (filters.children.length === 0) return;
  builder.where((nested) => applyNode(nested, filters, database, sourceName));
}
