import {
  lockPermissionCollection,
  validateSourcePermission,
} from "../permissions/collection-lock.js";
import {
  parseRowFilter,
  validateRowFilter,
} from "../permissions/row-filter.js";
import type { PermissionFilter } from "@asmblyr-collaborative/contracts";
import type { CollectionPermissionInput } from "../permissions/validation.js";
import type { Knex } from "knex";
import {
  PermissionInputError,
  PermissionNotFoundError,
  type PermissionAction,
} from "../permissions/validation.js";

interface CollectionRow {
  id: string;
  name: string;
}
interface PermissionRow {
  id: string;
  collection_id: string;
  action: PermissionAction;
  fields: string[];
  row_filter: PermissionFilter | null;
}

function fieldsKey(fields: string[]): string {
  return [...fields].sort().join("\u0000");
}

function grantKey(
  collectionId: string,
  action: PermissionAction,
  fields: string[],
  rowFilter?: PermissionFilter | null,
): string {
  return `${collectionId}:${action}:${fieldsKey(fields)}:${JSON.stringify(parseRowFilter(rowFilter ?? null))}`;
}

export async function writePermissions(
  transaction: Knex.Transaction,
  policyId: string,
  input: { permissions: CollectionPermissionInput[] },
): Promise<void> {
  const names = [
    ...new Set(input.permissions.map((entry) => entry.collection)),
  ].sort();
  const collections =
    names.length === 0
      ? []
      : await transaction("asmblyr_collections")
          .withSchema("public")
          .whereIn("name", names)
          .select<CollectionRow[]>("id", "name");
  if (collections.length !== names.length) {
    throw new PermissionNotFoundError();
  }
  const byName = new Map(
    collections.map((collection) => [collection.name, collection]),
  );

  for (const name of names) {
    await lockPermissionCollection(transaction, name);
  }
  const columns =
    names.length === 0
      ? []
      : await transaction("public.asmblyr_columns")
          .where({ table_schema: "public" })
          .whereIn("table_name", names)
          .select<
            { table_name: string; column_name: string }[]
          >("table_name", "column_name");
  const available = new Set(
    columns.map((column) => `${column.table_name}:${column.column_name}`),
  );
  const aliases =
    names.length === 0
      ? []
      : await transaction("asmblyr_relation_aliases")
          .withSchema("public")
          .whereIn("collection_name", names)
          .select<
            { collection_name: string; field_name: string }[]
          >("collection_name", "field_name");
  const readableAliases = new Set(
    aliases.map((alias) => `${alias.collection_name}:${alias.field_name}`),
  );
  for (const entry of input.permissions) {
    await validateSourcePermission(transaction, entry.collection, entry.action);
    await validateRowFilter(transaction, entry.collection, entry.rowFilter);
    if (
      entry.fields.some(
        (field) =>
          field !== "*" &&
          !available.has(`${entry.collection}:${field}`) &&
          (entry.action !== "read" ||
            !readableAliases.has(`${entry.collection}:${field}`)),
      )
    ) {
      throw new PermissionInputError("Unknown permission field");
    }
  }

  const linked = await transaction("asmblyr_policy_permissions as link")
    .withSchema("public")
    .join(
      "asmblyr_permissions as permission",
      "permission.id",
      "link.permission_id",
    )
    .where("link.policy_id", policyId)
    .whereNotNull("permission.collection_id")
    .select<
      PermissionRow[]
    >("permission.id", "permission.collection_id", "permission.action", "permission.fields", "permission.row_filter");
  const catalog =
    collections.length === 0
      ? []
      : await transaction("asmblyr_permissions")
          .withSchema("public")
          .whereIn(
            "collection_id",
            collections.map((entry) => entry.id),
          )
          .select<PermissionRow[]>(
            "id",
            "collection_id",
            "action",
            "fields",
            "row_filter",
          );
  const selected = new Set<string>();

  for (const entry of input.permissions) {
    const collectionId = byName.get(entry.collection)!.id;
    const key = grantKey(
      collectionId,
      entry.action,
      entry.fields,
      entry.rowFilter,
    );
    let permission =
      linked.find(
        (candidate) =>
          grantKey(
            candidate.collection_id,
            candidate.action,
            candidate.fields,
            candidate.row_filter,
          ) === key,
      ) ??
      catalog.find(
        (candidate) =>
          grantKey(
            candidate.collection_id,
            candidate.action,
            candidate.fields,
            candidate.row_filter,
          ) === key,
      );

    if (!permission) {
      const previous = linked.filter(
        (candidate) =>
          candidate.collection_id === collectionId &&
          candidate.action === entry.action,
      );
      if (
        previous.length === 1 &&
        input.permissions.filter(
          (candidate) =>
            candidate.collection === entry.collection &&
            candidate.action === entry.action,
        ).length === 1
      ) {
        const existing = previous[0];
        await transaction("asmblyr_permissions")
          .withSchema("public")
          .where({ id: existing.id })
          .forUpdate()
          .first("id");
        const count = await transaction("asmblyr_policy_permissions")
          .withSchema("public")
          .where({ permission_id: existing.id })
          .count<{ count: string }>("* as count")
          .first();
        if (Number(count?.count) === 1) {
          await transaction("asmblyr_permissions")
            .withSchema("public")
            .where({ id: existing.id })
            .update({
              fields: entry.fields,
              row_filter: entry.rowFilter ?? null,
            });
          permission = {
            ...existing,
            fields: entry.fields,
            row_filter: entry.rowFilter ?? null,
          };
        }
      }
    }
    if (!permission) {
      const [created] = await transaction("asmblyr_permissions")
        .withSchema("public")
        .insert({
          collection_id: collectionId,
          action: entry.action,
          fields: entry.fields,
          row_filter: entry.rowFilter ?? null,
        })
        .returning<PermissionRow[]>([
          "id",
          "collection_id",
          "action",
          "fields",
          "row_filter",
        ]);
      permission = created;
    }
    selected.add(permission.id);
    if (!linked.some((candidate) => candidate.id === permission.id)) {
      await transaction("asmblyr_policy_permissions")
        .withSchema("public")
        .insert({ policy_id: policyId, permission_id: permission.id });
    }
  }
  const obsolete = linked
    .filter((permission) => !selected.has(permission.id))
    .map((permission) => permission.id);
  if (obsolete.length > 0) {
    await transaction("asmblyr_policy_permissions")
      .withSchema("public")
      .where({ policy_id: policyId })
      .whereIn("permission_id", obsolete)
      .delete();
  }
}
