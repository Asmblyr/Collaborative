import type { Knex } from "knex";
import { rowPredicate } from "../permissions/row-access.js";
import type { Access } from "../permissions/access.js";
import {
  relationSearchQuery,
  type RelationSearchPath,
} from "./relation-search.js";

export interface SearchPlan {
  matches: Knex.Raw[];
  rank: Knex.Raw;
}

export function searchPattern(query: string): string {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function textRank(
  db: Knex,
  column: string,
  query: string,
  primary: boolean,
): Knex.Raw {
  const literal = query.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  // Match kind takes precedence; field priority resolves equal kinds. Punctuation
  // is literal, and word boundaries distinguish 'корм' from 'подкормка'.
  return db.raw(
    `CASE
    WHEN lower(btrim(??::text)) = lower(?) THEN ?::integer
    WHEN btrim(??::text) ~* ? THEN ?::integer
    WHEN ??::text ~* ? THEN ?::integer
    ELSE ?::integer END`,
    [
      column,
      query,
      primary ? 2 : 3,
      column,
      `^${literal}\\M`,
      primary ? 4 : 5,
      column,
      `\\m${literal}\\M`,
      primary ? 6 : 7,
      primary ? 8 : 9,
    ],
  );
}

function keyMatches(
  query: string,
  type: "uuid" | "serial" | "bigserial" | "text",
): boolean {
  if (type === "text") {
    return true;
  }
  if (type === "uuid") {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      query,
    );
  }
  if (!/^\d+$/.test(query)) {
    return false;
  }
  return (
    BigInt(query) <= (type === "serial" ? 2147483647n : 9223372036854775807n)
  );
}

export function prepareItemSearch(
  db: Knex,
  columns: string[],
  query: string,
  keyType: "uuid" | "serial" | "bigserial" | "text",
  relations: RelationSearchPath[] = [],
  access?: Access,
  collection?: string,
  priorities = new Map<string, boolean>(),
): SearchPlan {
  const matches: Knex.Raw[] = [];
  const ranks: Knex.Raw[] = [];
  const pattern = searchPattern(query);
  const qualify = (column: string) =>
    collection && !column.includes(".") ? `${collection}.${column}` : column;
  for (const [index, field] of columns.entries()) {
    const column = qualify(field);
    if (index === 0) {
      if (!keyMatches(query, keyType)) {
        continue;
      }
      const match =
        keyType === "text"
          ? db.raw("strpos(lower(??::text), lower(?)) > 0", [column, query])
          : db.raw("?? = ?", [column, query]);
      matches.push(match);
      const rank =
        keyType === "text"
          ? db.raw("CASE WHEN lower(??::text) = lower(?) THEN 0 ELSE 9 END", [
              column,
              query,
            ])
          : db.raw("0");
      ranks.push(db.raw("CASE WHEN (?) THEN (?) ELSE 99 END", [match, rank]));
      continue;
    }
    const permission =
      access && collection
        ? rowPredicate(
            db,
            access,
            collection,
            "read",
            field.split(".").at(-1),
            column.split(".")[0],
          )
        : db.raw("TRUE");
    const match = db.raw("(?) AND lower(??) LIKE lower(?) ESCAPE E'\\\\'", [
      permission,
      column,
      pattern,
    ]);
    matches.push(match);
    const rank = textRank(db, column, query, priorities.get(field) ?? false);
    ranks.push(db.raw("CASE WHEN (?) THEN (?) ELSE 99 END", [match, rank]));
  }
  for (const path of relations) {
    if (!collection || (path.kind === "m2m" && !path.relatedField)) {
      continue;
    }
    const relatedAlias = collection === "related" ? "_related" : "related";
    const bridgeAlias = collection === "bridge" ? "_bridge" : "bridge";
    const related = relationSearchQuery(
      db,
      path,
      pattern,
      relatedAlias,
      bridgeAlias,
    );
    let linked = `${relatedAlias}.${path.targetKey}`;
    if (path.kind === "m2m") {
      linked = `${bridgeAlias}.${path.throughField}`;
    } else if (path.kind === "o2m") {
      linked = `${relatedAlias}.${path.throughField}`;
    }
    related.whereRaw("?? = ??", [
      linked,
      qualify(path.kind === "m2o" ? path.sourceField : path.sourceKey),
    ]);
    matches.push(db.raw("EXISTS (?)", [related.clone()]));
    const values = path.targetFields.map((field) =>
      textRank(
        db,
        `${relatedAlias}.${field}`,
        query,
        path.targetPriorities?.[field] ?? false,
      ),
    );
    // Nonmatching target fields must not contribute an ELSE rank to the best hit.
    const guarded = values.map((rank, index) =>
      db.raw(
        "CASE WHEN lower(??) LIKE lower(?) ESCAPE E'\\\\' THEN (?) ELSE 99 END",
        [`${relatedAlias}.${path.targetFields[index]}`, pattern, rank],
      ),
    );
    related
      .clearSelect()
      .select(
        db.raw(`min(least(${guarded.map(() => "?").join(", ")}))`, guarded),
      );
    ranks.push(db.raw("coalesce((?), 99)", [related]));
  }
  return {
    matches,
    rank: ranks.length
      ? db.raw(`least(${ranks.map(() => "?").join(", ")})`, ranks)
      : db.raw("99::integer"),
  };
}

export function applySearchPlan(
  builder: Knex.QueryBuilder,
  plan: SearchPlan,
): void {
  if (!plan.matches.length) {
    builder.whereRaw("FALSE");
    return;
  }
  builder.where((where) => {
    for (const match of plan.matches) {
      where.orWhereRaw("(?)", [match]);
    }
  });
}
