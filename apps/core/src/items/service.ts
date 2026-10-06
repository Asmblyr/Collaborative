import {
  applyRowAccess,
  selectRowPermissions,
  projectRow,
  assertRowWrite,
} from "../permissions/row-access.js";
import type { Knex } from "knex";
import { assertWritableFields } from "../permissions/access.js";
import {
  collectionSchema,
  lockedCollectionSchema,
} from "./schema-repository.js";
import { recordItemEvent, type MutationContext } from "./events-repository.js";
import { ItemError, parseItem, parseItemId } from "./validation.js";
import type { ItemListQuery } from "./list-query.js";
import { itemReadQuery } from "./read-query.js";
import { listCollections } from "../collections/catalog-repository.js";
import type { Access } from "../permissions/access.js";
import { databaseValues } from "./database-values.js";
import { syncFileReferences, validateFileWrites } from "../files/references.js";
import { resolveRecordLabels } from "./record-labels.js";
import { applyFieldRules } from "./field-rule-service.js";
import { selectedColumns } from "./read-columns.js";

export { selectedColumns } from "./read-columns.js";

export async function listItems(
  database: Knex,
  name: string,
  allowed: string[],
  query: ItemListQuery = {},
  access?: Access,
) {
  const schema = await collectionSchema(database, name);
  const catalog = access ? await listCollections(database) : [];
  const read = itemReadQuery(
    database,
    name,
    schema,
    allowed,
    query,
    catalog,
    access,
  );
  const columns = selectedColumns(schema, allowed, query.fields);
  const { page, limit, sort, direction, offset } = read.options;
  const [data, count] = await Promise.all([
    read.query
      .clone()
      .select(columns)
      .modify((builder) =>
        selectRowPermissions(builder, database, access, name),
      )
      .modify(read.order)
      .limit(limit)
      .offset(offset),
    read.query.clone().count<{ total: string }>("* as total").first(),
  ]);
  const labels = access
    ? await resolveRecordLabels(
        database,
        name,
        data.map((item: Record<string, unknown>) =>
          String(item[schema.settings.primaryKey.name]),
        ),
        access,
        catalog,
      )
    : undefined;
  return {
    data: data.map((row: Record<string, unknown>) =>
      projectRow(row, access, name, schema.settings.primaryKey.name),
    ),
    ...(labels ? { labels } : {}),
    page: {
      number: page,
      size: limit,
      total: count?.total ?? "0",
      order: read.options.order,
      sort,
      direction,
    },
  };
}

export async function getItem(
  database: Knex,
  name: string,
  id: string,
  allowed: string[],
  fields?: unknown,
  access?: Access,
) {
  const schema = await collectionSchema(database, name);
  const { settings } = schema;
  const item = await database(name)
    .withSchema("public")
    .where(settings.primaryKey.name, parseItemId(id, settings.primaryKey.type))
    .select(selectedColumns(schema, allowed, fields))
    .modify((query) => {
      applyRowAccess(query, database, access, name);
      selectRowPermissions(query, database, access, name);
    })
    .first();
  if (!item) throw new ItemError("Item not found", 404);
  return projectRow(item, access, name, settings.primaryKey.name);
}

export async function createItem(
  database: Knex,
  name: string,
  body: unknown,
  context: MutationContext,
  allowed: string[],
) {
  try {
    return await database.transaction(async (transaction) => {
      const { settings, fields } = await lockedCollectionSchema(
        transaction,
        name,
      );
      assertWritableFields(
        body,
        allowed,
        settings.primaryKey.type === "text"
          ? settings.primaryKey.name
          : undefined,
      );
      const parsed = parseItem(
        body,
        fields,
        true,
        settings.primaryKey.type === "text"
          ? settings.primaryKey.name
          : undefined,
      );
      const values = await applyFieldRules(
        transaction,
        name,
        fields,
        parsed,
        null,
        context,
        Object.keys(body as Record<string, unknown>),
      );
      await validateFileWrites(transaction, values, fields, context.actor);
      if (settings.mode === "single") {
        await transaction.raw(
          "SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))",
          [settings.internalId],
        );
        const existing = await transaction(name)
          .withSchema("public")
          .first(settings.primaryKey.name);
        if (existing)
          throw new ItemError(
            "Single-object collection already has an item",
            409,
          );
      }
      const [item] = await transaction(name)
        .withSchema("public")
        .insert(databaseValues(values, fields))
        .returning("*");
      await assertRowWrite(
        transaction,
        context.access,
        name,
        "create",
        settings.primaryKey.name,
        item[settings.primaryKey.name],
        [
          ...new Set([
            ...Object.keys(body as Record<string, unknown>),
            ...[...fields.values()]
              .filter(
                (field) =>
                  field.presentation?.rules?.computed &&
                  Object.hasOwn(values, field.name),
              )
              .map((field) => field.name),
          ]),
        ].filter((field) => field !== settings.primaryKey.name),
      );
      await syncFileReferences(
        transaction,
        settings.internalId,
        String(item[settings.primaryKey.name]),
        fields,
        item,
      );
      await recordItemEvent(
        transaction,
        {
          id: settings.internalId,
          name,
          itemId: String(item[settings.primaryKey.name]),
        },
        "create",
        null,
        item,
        context,
      );
      return item;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new ItemError("Primary key already exists", 409);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23503"
    ) {
      throw new ItemError("Related item does not exist", 409);
    }
    throw error;
  }
}

export { updateItem } from "./update-service.js";

export async function deleteItem(
  database: Knex,
  name: string,
  id: string,
  context: MutationContext,
): Promise<void> {
  await database
    .transaction(async (transaction) => {
      const { settings, fields } = await lockedCollectionSchema(
        transaction,
        name,
      );
      const itemId = parseItemId(id, settings.primaryKey.type);
      const existing = await transaction(name)
        .withSchema("public")
        .where(settings.primaryKey.name, itemId)
        .forUpdate()
        .first(settings.primaryKey.name);
      if (!existing) throw new ItemError("Item not found", 404);
      await assertRowWrite(
        transaction,
        context.access,
        name,
        "delete",
        settings.primaryKey.name,
        itemId,
        [],
      );
      const [item] = await transaction(name)
        .withSchema("public")
        .where(settings.primaryKey.name, itemId)
        .delete()
        .returning("*");
      if (!item) throw new ItemError("Item not found", 404);
      await syncFileReferences(
        transaction,
        settings.internalId,
        String(item[settings.primaryKey.name]),
        fields,
        null,
      );
      await recordItemEvent(
        transaction,
        {
          id: settings.internalId,
          name,
          itemId: String(item[settings.primaryKey.name]),
        },
        "delete",
        item,
        null,
        context,
      );
    })
    .catch((error: unknown) => {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23503"
      ) {
        throw new ItemError("Item is referenced by related records", 409);
      }
      throw error;
    });
}
