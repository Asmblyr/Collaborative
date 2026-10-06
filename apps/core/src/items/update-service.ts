import { assertRowWrite } from "../permissions/row-access.js";
import type { Knex } from "knex";
import { assertWritableFields } from "../permissions/access.js";
import { lockedCollectionSchema } from "./schema-repository.js";
import {
  changedFields,
  recordItemEvent,
  type MutationContext,
} from "./events-repository.js";
import { ItemError, parseItem, parseItemId } from "./validation.js";
import { databaseValues } from "./database-values.js";
import { syncFileReferences, validateFileWrites } from "../files/references.js";
import { applyFieldRules } from "./field-rule-service.js";
import { assertExpectedValues } from "./expected-values.js";

export async function updateItemRow(
  transaction: Knex.Transaction,
  name: string,
  schema: Awaited<ReturnType<typeof lockedCollectionSchema>>,
  id: string,
  values: Record<string, unknown>,
  context: MutationContext,
  expectedValues?: Record<string, unknown>,
) {
  const { settings, fields } = schema;
  const itemId = parseItemId(id, settings.primaryKey.type);
  const before = await transaction(name)
    .withSchema("public")
    .where(settings.primaryKey.name, itemId)
    .forUpdate()
    .first();
  if (!before) throw new ItemError("Item not found", 404);
  const permitted = await assertRowWrite(
    transaction,
    context.access,
    name,
    "update",
    settings.primaryKey.name,
    itemId,
    Object.keys(values),
  );
  await assertExpectedValues(
    transaction,
    name,
    String(before[settings.primaryKey.name]),
    before,
    values,
    expectedValues,
    context,
  );
  values = await applyFieldRules(
    transaction,
    name,
    fields,
    values,
    before,
    context,
  );
  if (
    Object.keys(changedFields(before, { ...before, ...values }).after)
      .length === 0
  )
    return { item: before, changed: false };
  await validateFileWrites(transaction, values, fields, context.actor, before);
  const changes = {
    ...values,
    ...(settings.timestamps.updatedAt
      ? { updated_at: transaction.fn.now() }
      : {}),
  };
  const [item] = await transaction(name)
    .withSchema("public")
    .where(settings.primaryKey.name, itemId)
    .update(databaseValues(changes, fields))
    .returning("*");
  await assertRowWrite(
    transaction,
    context.access,
    name,
    "update",
    settings.primaryKey.name,
    itemId,
    Object.keys(values),
    permitted,
  );
  await syncFileReferences(
    transaction,
    settings.internalId,
    itemId,
    fields,
    item,
  );
  const diff = changedFields(before, item);
  await recordItemEvent(
    transaction,
    { id: settings.internalId, name, itemId },
    "update",
    diff.before,
    diff.after,
    context,
  );
  return { item, changed: true };
}

export function rethrowItemConstraint(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23503"
  )
    throw new ItemError("Related item does not exist", 409);
  throw error;
}

export async function updateItem(
  database: Knex,
  name: string,
  id: string,
  body: unknown,
  context: MutationContext,
  allowed: string[],
  expectedValues?: Record<string, unknown>,
) {
  return database
    .transaction(async (transaction) => {
      const schema = await lockedCollectionSchema(transaction, name);
      assertWritableFields(body, allowed);
      const values = parseItem(body, schema.fields, false);
      return (
        await updateItemRow(
          transaction,
          name,
          schema,
          id,
          values,
          context,
          expectedValues,
        )
      ).item;
    })
    .catch(rethrowItemConstraint);
}
