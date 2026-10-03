import type { Knex } from "knex";
import { requireGrant } from "../permissions/access.js";
import { changedFields, type MutationContext } from "./events-repository.js";
import { getItem } from "./service.js";
import { ItemError } from "./validation.js";

/** Called after acquiring the row lock and checking write permissions. */
export async function assertExpectedValues(
  transaction: Knex.Transaction,
  collection: string,
  id: string,
  before: Record<string, unknown>,
  values: Record<string, unknown>,
  expected: Record<string, unknown> | undefined,
  context: MutationContext,
): Promise<void> {
  if (expected === undefined) {
    return;
  }
  const fields = Object.keys(values);
  if (fields.some((field) => !Object.hasOwn(expected, field))) {
    throw new ItemError("Supply original values for every updated field", 400);
  }
  // A precondition must not become a way to guess a write-only field's value.
  if (!context.access) {
    throw new ItemError("Expected values require read access", 403);
  }
  const readable = await getItem(
    transaction,
    collection,
    id,
    requireGrant(context.access, collection, "read"),
    fields.join(","),
    context.access,
  );
  if (fields.some((field) => !Object.hasOwn(readable, field))) {
    throw new ItemError("Expected values require read access", 403);
  }
  const address = JSON.stringify([collection, id]);
  const original = context.expectedSnapshots?.get(address) ?? before;
  context.expectedSnapshots?.set(address, original);
  const changed = changedFields(expected, {
    ...expected,
    ...Object.fromEntries(fields.map((field) => [field, original[field]])),
  }).after;
  const requested = changedFields(before, { ...before, ...values }).after;
  if (
    fields.some(
      (field) =>
        Object.hasOwn(changed, field) && Object.hasOwn(requested, field),
    )
  ) {
    throw new ItemError(
      "Запись изменилась. Проверьте актуальные значения. Черновик не потерян.",
      409,
      "ITEM_CHANGED",
    );
  }
}
