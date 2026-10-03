import type { Knex } from "knex";
import type { FilterGroup, FilterNode } from "../items/filter-input.js";
import { applyItemFilters } from "../items/filter-query.js";
import { AccessDeniedError, projectFields, type Access } from "./access.js";
import type { PermissionAction } from "./validation.js";

export interface CompiledRule {
  fields: string[];
  filter: FilterGroup | null | false;
}

function rulesFor(
  access: Access,
  name: string,
  action: PermissionAction,
): CompiledRule[] {
  if (access.principal.superuser) return [{ fields: ["*"], filter: null }];
  return (
    access.rowRules?.get(`${name}:${action}`) ??
    (access.grants.has(`${name}:${action}`)
      ? [{ fields: access.grants.get(`${name}:${action}`)!, filter: null }]
      : [])
  );
}

function qualify(node: FilterNode, alias: string): FilterNode {
  if ("logic" in node)
    return {
      ...node,
      children: node.children.map((child) => qualify(child, alias)),
    };
  return {
    ...node,
    resolved: { ...node.resolved, column: `${alias}.${node.resolved.column}` },
  };
}

function expression(db: Knex, rule: CompiledRule, alias: string): Knex.Raw {
  if (rule.filter === null) return db.raw("TRUE");
  if (rule.filter === false) return db.raw("FALSE");
  const query = db.queryBuilder();
  applyItemFilters(
    query,
    qualify(rule.filter, alias) as FilterGroup,
    db,
    alias,
  );
  const sql = query.toSQL();
  return db.raw(sql.sql.slice(sql.sql.indexOf(" where ") + 7), [
    ...sql.bindings,
  ]);
}

export function rowPredicate(
  db: Knex,
  access: Access,
  name: string,
  action: PermissionAction,
  field?: string,
  alias = name,
  permitted?: number[],
): Knex.Raw {
  const rules = rulesFor(access, name, action).filter(
    (rule, index) =>
      (!permitted || permitted.includes(index)) &&
      (!field || rule.fields.includes("*") || rule.fields.includes(field)),
  );
  if (!rules.length) return db.raw("FALSE");
  return db.raw(
    `(${rules.map(() => "(?)").join(" OR ")})`,
    rules.map((rule) => expression(db, rule, alias)),
  );
}

/** Restrict rows before pagination/counting. Referenced fields also need permission on that row. */
export function applyRowAccess(
  query: Knex.QueryBuilder,
  db: Knex,
  access: Access | undefined,
  name: string,
  action: PermissionAction = "read",
  fields: string[] = [],
  alias = name,
  primaryKey?: string,
): void {
  if (!access || access.principal.superuser) return;
  query.where(rowPredicate(db, access, name, action, undefined, alias));
  for (const field of new Set(fields)) {
    if (field !== primaryKey)
      query.where(rowPredicate(db, access, name, action, field, alias));
  }
}

/** Internal flags preserve the association between a rule's condition and its field grant. */
export function selectRowPermissions(
  query: Knex.QueryBuilder,
  db: Knex,
  access: Access | undefined,
  name: string,
  alias = name,
): void {
  if (!access?.rowRules?.has(`${name}:read`) || access.principal.superuser)
    return;
  rulesFor(access, name, "read").forEach((rule, index) => {
    query.select(
      db.raw("(?) as ??", [
        expression(db, rule, alias),
        `_asmblyr_grant_${index}`,
      ]),
    );
  });
}

export function projectRow(
  row: Record<string, unknown>,
  access: Access | undefined,
  name: string,
  primaryKey: string,
): Record<string, unknown> {
  if (!access?.rowRules?.has(`${name}:read`) || access.principal.superuser)
    return row;
  const fields = rulesFor(access, name, "read").flatMap((rule, index) =>
    row[`_asmblyr_grant_${index}`] === true ? rule.fields : [],
  );
  const clean = Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith("_asmblyr_grant_")),
  );
  return projectFields(clean, fields, primaryKey)!;
}

/** Check old and new states against the same branches; an ownership change cannot switch grants. */
export async function assertRowWrite(
  db: Knex,
  access: Access | undefined,
  name: string,
  action: PermissionAction,
  key: string,
  id: unknown,
  fields: string[],
  prior?: number[],
): Promise<number[] | undefined> {
  if (!access || access.principal.superuser) return undefined;
  const query = db(name)
    .withSchema("public")
    .where(key, id as string);
  const rules = rulesFor(access, name, action);
  rules.forEach((rule, index) =>
    query.select(
      db.raw("(?) as ??", [
        expression(db, rule, name),
        `_asmblyr_grant_${index}`,
      ]),
    ),
  );
  if (!rules.length) throw new AccessDeniedError();
  const row = await query.first();
  const matched = rules.flatMap((_rule, index) =>
    row?.[`_asmblyr_grant_${index}`] === true &&
    (!prior || prior.includes(index))
      ? [index]
      : [],
  );
  if (
    !matched.length ||
    fields.some(
      (field) =>
        !matched.some(
          (index) =>
            rules[index].fields.includes("*") ||
            rules[index].fields.includes(field),
        ),
    )
  )
    throw new AccessDeniedError();
  return matched;
}

/** Diff-only history cannot prove an old row condition; expose only unconditional grants. */
export function historyFields(access: Access, name: string): string[] {
  return [
    ...new Set(
      rulesFor(access, name, "read")
        .filter((rule) => rule.filter === null)
        .flatMap((rule) => rule.fields),
    ),
  ];
}
