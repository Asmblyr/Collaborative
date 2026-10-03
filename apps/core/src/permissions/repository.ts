import { validateRowFilter } from "./row-filter.js";
import type {
  PermissionFilter,
  SettingsPermissionInput,
  SettingsSection,
} from "@asmblyr/contracts";
import { ensureSettingsPermission } from "./settings-permissions.js";
import type { Knex } from "knex";
import { findCollectionSettings } from "../collections/settings-repository.js";
import {
  PermissionConflictError,
  PermissionInputError,
  PermissionNotFoundError,
} from "./validation.js";
import type { CreatePermissionInput, PermissionAction } from "./validation.js";

type PermissionRow = { id: string; policyIds: string[] } & (
  | {
      collection: string;
      action: PermissionAction;
      fields: string[];
      rowFilter?: PermissionFilter | null;
    }
  | SettingsPermissionInput
);
interface StoredPermission {
  id: string;
  collection: string | null;
  section: SettingsSection | null;
  action: PermissionAction;
  fields: string[];
  policyIds: string[];
  rowFilter: PermissionFilter | null;
}
function permissionResult(row: StoredPermission): PermissionRow {
  const { id, policyIds, action, fields } = row;
  if (row.section) {
    if (action !== "read" && action !== "update") {
      throw new Error("Invalid settings permission action");
    }
    return {
      id,
      policyIds,
      section: row.section,
      action,
      fields: ["*"],
    };
  }
  if (!row.collection) {
    throw new Error("Permission target is missing");
  }
  return {
    id,
    policyIds,
    collection: row.collection,
    action,
    fields,
    ...(row.rowFilter ? { rowFilter: row.rowFilter } : {}),
  };
}

function permissionQuery(database: Knex) {
  return database("asmblyr_permissions as permission")
    .withSchema("public")
    .leftJoin(
      "asmblyr_collections as collection",
      "collection.id",
      "permission.collection_id",
    )
    .select<StoredPermission[]>(
      "permission.id",
      "collection.name as collection",
      "permission.action",
      "permission.fields",
      "permission.row_filter as rowFilter",
      "permission.section",
      database.raw(
        `COALESCE((SELECT array_agg(link.policy_id ORDER BY link.policy_id)
        FROM public.asmblyr_policy_permissions AS link
        WHERE link.permission_id = permission.id), ARRAY[]::uuid[]) AS ??`,
        ["policyIds"],
      ),
    );
}

function translateDatabaseError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23505") {
      throw new PermissionConflictError();
    }
    if (error.code === "23503" || error.code === "42P01") {
      throw new PermissionNotFoundError();
    }
  }
  throw error;
}

async function validateFields(
  transaction: Knex.Transaction,
  collection: string,
  fields: string[],
  action: PermissionAction,
): Promise<void> {
  if (fields[0] === "*") {
    return;
  }
  const columns = await transaction("information_schema.columns")
    .where({ table_schema: "public", table_name: collection })
    .whereIn("column_name", fields)
    .pluck<string[]>("column_name");
  const available = new Set(columns);
  if (action === "read") {
    const aliases = await transaction("asmblyr_relation_aliases")
      .withSchema("public")
      .where({ collection_name: collection })
      .whereIn("field_name", fields)
      .pluck<string[]>("field_name");
    for (const alias of aliases) {
      available.add(alias);
    }
  }
  if (fields.some((field) => !available.has(field))) {
    throw new PermissionInputError("Unknown permission field");
  }
}

export async function listPermissions(
  database: Knex,
  policyId?: string,
): Promise<PermissionRow[]> {
  const query = permissionQuery(database);
  if (policyId) {
    query.whereIn(
      "permission.id",
      database("asmblyr_policy_permissions")
        .withSchema("public")
        .where({ policy_id: policyId })
        .select("permission_id"),
    );
  }
  const rows = await query.orderBy([
    "collection.name",
    "permission.section",
    "permission.action",
    "permission.id",
  ]);
  return rows.map(permissionResult);
}

export async function getPermission(
  database: Knex,
  id: string,
): Promise<PermissionRow> {
  const permission = await permissionQuery(database)
    .where("permission.id", id)
    .first<StoredPermission>();
  if (!permission) {
    throw new PermissionNotFoundError();
  }
  return permissionResult(permission);
}

export async function createPermission(
  database: Knex,
  input: CreatePermissionInput,
): Promise<PermissionRow> {
  try {
    return await database.transaction(async (transaction) => {
      if ("section" in input) {
        return getPermission(
          transaction,
          await ensureSettingsPermission(
            transaction,
            input.section,
            input.action,
          ),
        );
      }
      const settings = await findCollectionSettings(
        transaction,
        input.collection,
      );
      if (!settings) {
        throw new PermissionNotFoundError();
      }
      await transaction.raw("LOCK TABLE ?? IN ACCESS SHARE MODE", [
        `public.${input.collection}`,
      ]);
      await validateFields(
        transaction,
        input.collection,
        input.fields,
        input.action,
      );
      await validateRowFilter(transaction, input.collection, input.rowFilter);
      const [created] = await transaction("asmblyr_permissions")
        .withSchema("public")
        .insert({
          collection_id: settings.internalId,
          action: input.action,
          fields: input.fields,
          row_filter: input.rowFilter ?? null,
        })
        .returning<{ id: string }[]>("id");
      return getPermission(transaction, created.id);
    });
  } catch (error) {
    return translateDatabaseError(error);
  }
}

export async function updatePermission(
  database: Knex,
  id: string,
  fields: string[],
  rowFilter?: PermissionFilter | null,
): Promise<PermissionRow> {
  try {
    return await database.transaction(async (transaction) => {
      const permission = await getPermission(transaction, id);
      if ("section" in permission) {
        if (rowFilter !== undefined)
          throw new PermissionInputError(
            "Settings permissions do not support row conditions",
          );
        if (fields.length !== 1 || fields[0] !== "*") {
          throw new PermissionInputError(
            "Settings permissions do not have field-level grants",
          );
        }
        return permission;
      }
      await transaction.raw("LOCK TABLE ?? IN ACCESS SHARE MODE", [
        `public.${permission.collection}`,
      ]);
      await validateFields(
        transaction,
        permission.collection,
        fields,
        permission.action,
      );
      await validateRowFilter(
        transaction,
        permission.collection,
        rowFilter === undefined ? permission.rowFilter : rowFilter,
      );
      const count = await transaction("asmblyr_permissions")
        .withSchema("public")
        .where({ id })
        .update({
          fields,
          ...(rowFilter === undefined ? {} : { row_filter: rowFilter }),
        });
      if (!count) {
        throw new PermissionNotFoundError();
      }
      return getPermission(transaction, id);
    });
  } catch (error) {
    return translateDatabaseError(error);
  }
}

export async function deletePermission(
  database: Knex,
  id: string,
): Promise<void> {
  const count = await database("asmblyr_permissions")
    .withSchema("public")
    .where({ id })
    .delete();
  if (!count) {
    throw new PermissionNotFoundError();
  }
}

export async function permissionRules(
  database: Knex,
  principalId: string,
  kind: "user" | "service" = "user",
) {
  const table =
    kind === "user" ? "asmblyr_user_policies" : "asmblyr_service_policies";
  const owner = kind === "user" ? "user_id" : "service_id";
  const grants = await database(`${table} as assignment`)
    .withSchema("public")
    .join(
      "asmblyr_policy_permissions as link",
      "link.policy_id",
      "assignment.policy_id",
    )
    .join(
      "asmblyr_permissions as permission",
      "permission.id",
      "link.permission_id",
    )
    .join(
      "asmblyr_collections as collection",
      "collection.id",
      "permission.collection_id",
    )
    .where(`assignment.${owner}`, principalId)
    .select<
      {
        collection: string;
        action: PermissionAction;
        fields: string[];
        rowFilter: PermissionFilter | null;
      }[]
    >("collection.name as collection", "permission.action", "permission.fields", "permission.row_filter as rowFilter");
  return grants;
}

export async function effectivePermissions(
  database: Knex,
  principalId: string,
  kind: "user" | "service" = "user",
) {
  const grants = await permissionRules(database, principalId, kind);
  const combined = new Map<
    string,
    { collection: string; action: PermissionAction; fields: string[] }
  >();
  for (const grant of grants) {
    const key = `${grant.collection}:${grant.action}`;
    const current = combined.get(key);
    const fields =
      current?.fields.includes("*") || grant.fields.includes("*")
        ? ["*"]
        : [...new Set([...(current?.fields ?? []), ...grant.fields])].sort();
    combined.set(key, {
      collection: grant.collection,
      action: grant.action,
      fields,
    });
  }
  return [...combined.values()]
    .map((entry) => {
      const rules = grants.filter(
        (grant) =>
          grant.collection === entry.collection &&
          grant.action === entry.action,
      );
      return {
        ...entry,
        ...(rules.some((rule) => rule.rowFilter)
          ? {
              rules: rules.map(({ fields, rowFilter }) => ({
                fields,
                rowFilter,
              })),
            }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        a.collection.localeCompare(b.collection) ||
        a.action.localeCompare(b.action),
    );
}
