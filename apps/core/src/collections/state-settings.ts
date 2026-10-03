import type { Knex } from "knex";
import type { CollectionState } from "@asmblyr/contracts";
import { lockedCollectionSettings } from "./settings-repository.js";
import { readEditableField } from "./editable-field.js";
import { statePresentation } from "./state-presentation.js";
import { assertNoAlias } from "./field-name.js";
import { CollectionInputError, CollectionFieldConflictError } from "./validation.js";

// Called inside the collection metadata transaction. Lock user data before
// metadata, matching item writes and other schema operations.
export async function saveCollectionState(
  transaction: Knex.Transaction,
  name: string,
  state: CollectionState | null,
): Promise<void> {
  const settings = await lockedCollectionSettings(transaction, name);
  if (!state) {
    if (settings.state)
      throw new CollectionInputError("System state cannot be removed once enabled");
    return;
  }
  if (settings.primaryKey.name === state.field)
    throw new CollectionInputError("State conflicts with the primary key");
  await assertNoAlias(transaction, name, state.field);
  const exists = await transaction.schema.withSchema("public").hasColumn(name, state.field);
  const current = exists ? await readEditableField(transaction, name, state.field) : null;
  if (current) {
    if (current.type !== "text" || current.relation_key_type) {
      throw new CollectionInputError(
        "Only an ordinary text field named status can become system state",
      );
    }
    const unknown = await transaction(name)
      .withSchema("public")
      .whereNotNull(state.field)
      .whereNotIn(
        state.field,
        state.statuses.map((status) => status.value),
      )
      .first(state.field);
    if (unknown) {
      throw new CollectionFieldConflictError(
        `State '${String(unknown[state.field]).slice(0, 100)}' is used by records. Keep this code or move those records to another state first.`,
      );
    }
    // Preserve existing NULLs and nullability during adoption. No record rewrite.
    const literal = await transaction.raw<{ rows: { value: string }[] }>(
      "SELECT quote_literal(?::text) AS value",
      [state.defaultValue],
    );
    await transaction.raw(`ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT ${literal.rows[0].value}`, [
      `public.${name}`,
      state.field,
    ]);
  } else {
    await transaction.schema.withSchema("public").alterTable(name, (table) => {
      table.text(state.field).notNullable().defaultTo(state.defaultValue);
    });
  }
  const metadata = {
    required: true,
    default_value: JSON.stringify(state.defaultValue),
    presentation: JSON.stringify(statePresentation(state, current?.presentation ?? undefined)),
  };
  await transaction("asmblyr_field_metadata")
    .withSchema("public")
    .insert({ collection_name: name, field_name: state.field, searchable: false, ...metadata })
    .onConflict(["collection_name", "field_name"])
    .merge(metadata);
  await transaction("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .update({ state: JSON.stringify(state) });
}
