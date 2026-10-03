import type { Knex } from "knex";
import { assertWritableFields } from "../permissions/access.js";
import { objectInput } from "../shared/input.js";
import { ItemError, parseItem, parseItemId } from "./validation.js";
import { lockedCollectionSchema } from "./schema-repository.js";
import { updateItemRow, rethrowItemConstraint } from "./update-service.js";
import type { MutationContext } from "./events-repository.js";

export function parseBulkUpdate(body: unknown) {
  const input = objectInput(body, ["ids", "values"]);
  if (
    !Array.isArray(input.ids) ||
    input.ids.length < 1 ||
    input.ids.length > 100 ||
    input.ids.some((id) => typeof id !== "string") ||
    new Set(input.ids).size !== input.ids.length
  ) {
    throw new ItemError("Supply 1–100 unique item identifiers", 400);
  }
  return { ids: input.ids as string[], values: input.values };
}

export async function bulkUpdateItems(
  database: Knex,
  name: string,
  body: ReturnType<typeof parseBulkUpdate>,
  context: MutationContext,
  allowed: string[],
) {
  return database
    .transaction(async (transaction) => {
      const schema = await lockedCollectionSchema(transaction, name);
      assertWritableFields(body.values, allowed);
      const values = parseItem(body.values, schema.fields, false);
      const ids = body.ids.map((id) => parseItemId(id, schema.settings.primaryKey.type));
      // Lock all selected rows in the same database order across concurrent batches.
      const rows = await transaction(name)
        .withSchema("public")
        .whereIn(schema.settings.primaryKey.name, ids)
        .orderBy(schema.settings.primaryKey.name)
        .forUpdate()
        .select(schema.settings.primaryKey.name);
      if (rows.length !== ids.length)
        throw new ItemError("Some selected items no longer exist; nothing was changed", 404);
      let changed = 0;
      for (const row of rows) {
        const result = await updateItemRow(
          transaction,
          name,
          schema,
          String(row[schema.settings.primaryKey.name]),
          values,
          context,
        );
        if (result.changed) changed++;
      }
      return { selected: ids.length, changed };
    })
    .catch(rethrowItemConstraint);
}
