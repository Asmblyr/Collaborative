import type { Knex } from "knex";
import type { Collection } from "./types.js";
import { listCollections } from "./catalog-repository.js";
import {
  lockedCollectionSettings,
  isManagedColumn,
} from "./settings-repository.js";
import { readEditableField } from "./editable-field.js";
import { normalizeFieldDefault } from "./field-default.js";
import {
  CollectionFieldConflictError,
  CollectionFieldNotFoundError,
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
  parseMutableFieldName,
  parseUpdateField,
} from "./validation.js";
import { postgresCode } from "../shared/postgres-error.js";

export async function updateCollectionField(
  database: Knex,
  collectionName: unknown,
  fieldName: unknown,
  body: unknown,
): Promise<Collection> {
  const name = parseMutableCollectionName(collectionName);
  await updateFieldDefinition(database, name, fieldName, body);
  const collection = (await listCollections(database)).find(
    (entry) => entry.name === name,
  );
  if (!collection) throw new CollectionNotFoundError(name);
  return collection;
}

export async function updateFieldDefinition(
  database: Knex,
  collectionName: unknown,
  fieldName: unknown,
  body: unknown,
  presentation?: unknown,
): Promise<void> {
  const name = parseMutableCollectionName(collectionName);
  const columnName = parseMutableFieldName(fieldName);
  const update = parseUpdateField(body);

  try {
    await database.transaction(async (transaction) => {
      const settings = await lockedCollectionSettings(transaction, name);
      if (isManagedColumn(settings, columnName)) {
        throw new CollectionInputError(
          `Field is managed by Core: ${columnName}`,
        );
      }

      const current = await readEditableField(transaction, name, columnName);
      const normalizedDefault = normalizeFieldDefault(
        current,
        columnName,
        update,
        presentation,
      );

      if (update.defaultValue !== undefined) {
        if (normalizedDefault === null) {
          await transaction.raw("ALTER TABLE ?? ALTER COLUMN ?? DROP DEFAULT", [
            `public.${name}`,
            columnName,
          ]);
        } else {
          const result = await transaction.raw<{ rows: { literal: string }[] }>(
            "SELECT quote_literal(?::text) AS literal",
            [
              current.type === "json"
                ? JSON.stringify(normalizedDefault)
                : String(normalizedDefault),
            ],
          );
          await transaction.raw(
            `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT ${result.rows[0].literal}`,
            [`public.${name}`, columnName],
          );
        }
      }

      if (
        update.nullable !== undefined &&
        update.nullable !== (current.is_nullable === "YES")
      ) {
        const constraint = update.nullable ? "DROP NOT NULL" : "SET NOT NULL";
        await transaction.raw(`ALTER TABLE ?? ALTER COLUMN ?? ${constraint}`, [
          `public.${name}`,
          columnName,
        ]);
      }

      if (
        (update.required !== undefined &&
          update.required !== current.required) ||
        update.defaultValue !== undefined
      ) {
        await transaction("asmblyr_field_metadata")
          .withSchema("public")
          .insert({
            collection_name: name,
            field_name: columnName,
            semantic_type: null,
            required: update.required ?? current.required,
            default_value:
              normalizedDefault === null
                ? null
                : JSON.stringify(normalizedDefault),
          })
          .onConflict(["collection_name", "field_name"])
          .merge({
            required: update.required ?? current.required,
            default_value:
              normalizedDefault === null
                ? null
                : JSON.stringify(normalizedDefault),
          });
      }
    });
  } catch (error) {
    if (postgresCode(error) === "42703")
      throw new CollectionFieldNotFoundError(columnName);
    if (postgresCode(error) === "23502") {
      throw new CollectionFieldConflictError(
        "Cannot make field non-nullable while records contain NULL",
      );
    }
    throw error;
  }
}
