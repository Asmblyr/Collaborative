import type { Knex } from "knex";
import { authenticatePrincipal, type Principal } from "../auth/principal.js";
import { permissionRules } from "./repository.js";
import type { PermissionAction } from "./validation.js";

import { collectionSchema } from "../items/schema-repository.js";
import { compileRowFilter, permissionContext } from "./row-filter.js";
import type { CompiledRule } from "./row-access.js";

export interface Access {
  readOnlyCollections?: Set<string>;
  principal: Principal;
  grants: Map<string, string[]>;
  rowRules?: Map<string, CompiledRule[]>;
}

export class AccessDeniedError extends Error {
  readonly statusCode = 403;
  constructor() {
    super("Permission denied");
  }
}

export async function loadAccess(
  database: Knex,
  authorization?: string,
): Promise<Access> {
  const principal = await authenticatePrincipal(database, authorization);
  return loadPrincipalAccess(database, principal);
}

export async function loadPrincipalAccess(
  database: Knex,
  principal: Principal,
): Promise<Access> {
  const permissions = principal.superuser
    ? []
    : await permissionRules(database, principal.id, principal.kind);
  const grants = new Map<string, string[]>();
  const rowRules = new Map<string, CompiledRule[]>();
  const context = permissionContext(principal);
  const schemas = new Map<
    string,
    Awaited<ReturnType<typeof collectionSchema>>
  >();
  for (const permission of permissions) {
    const key = `${permission.collection}:${permission.action}`;
    const fields = [
      ...new Set([...(grants.get(key) ?? []), ...permission.fields]),
    ];
    grants.set(key, fields.includes("*") ? ["*"] : fields);
    let filter: CompiledRule["filter"] = null;
    if (permission.rowFilter) {
      try {
        const schema =
          schemas.get(permission.collection) ??
          (await collectionSchema(database, permission.collection));
        schemas.set(permission.collection, schema);
        filter = compileRowFilter(
          permission.rowFilter,
          permission.collection,
          schema,
          context,
        );
      } catch {
        filter = false;
      }
    }
    rowRules.set(key, [
      ...(rowRules.get(key) ?? []),
      { fields: permission.fields, filter },
    ]);
  }
  for (const [key, rules] of rowRules)
    if (rules.every((rule) => rule.filter === null)) rowRules.delete(key);
  const readOnlyCollections = new Set(
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ source_kind: "materialized-view" })
      .pluck<string[]>("name"),
  );
  return { principal, grants, rowRules, readOnlyCollections };
}

export function grantFor(
  access: Access,
  collection: string,
  action: PermissionAction,
): string[] | null {
  if (action !== "read" && access.readOnlyCollections?.has(collection)) {
    return null;
  }
  return access.principal.superuser
    ? ["*"]
    : (access.grants.get(`${collection}:${action}`) ?? null);
}

export function requireHuman(access: Access): void {
  if (access.principal.kind !== "user") throw new AccessDeniedError();
}

export function requireGrant(
  access: Access,
  collection: string,
  action: PermissionAction,
): string[] {
  const fields = grantFor(access, collection, action);
  if (!fields) throw new AccessDeniedError();
  return fields;
}

export function assertWritableFields(
  body: unknown,
  fields: string[],
  primaryKey?: string,
): void {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return;
  if (fields.includes("*")) return;
  for (const name of Object.keys(body)) {
    if (name !== primaryKey && !fields.includes(name))
      throw new AccessDeniedError();
  }
}

export function projectFields(
  row: Record<string, unknown> | null,
  fields: string[],
  primaryKey?: string,
): Record<string, unknown> | null {
  if (row === null || fields.includes("*")) return row;
  return Object.fromEntries(
    Object.entries(row).filter(
      ([name]) => name === primaryKey || fields.includes(name),
    ),
  );
}
