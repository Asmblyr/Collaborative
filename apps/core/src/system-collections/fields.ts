import type { Knex } from "knex";
import { addFieldColumn } from "../collections/field-types.js";
import {
  CollectionFieldConflictError,
  CollectionFieldNotFoundError,
  ProtectedFieldError,
  CollectionDependencyError,
} from "../collections/validation.js";
import { postgresCode } from "../shared/postgres-error.js";
import { addSystemRelationConstraint } from "./relations.js";
import {
  customFields,
  lockSystemCollection,
  readSystemCollection,
} from "./repository.js";
import {
  parseCustomFieldName,
  parseCustomFieldConfiguration,
} from "./field-input.js";

async function ownedField(
  db: Knex,
  name: string,
  field: string,
  table: string,
) {
  const current = await customFields(db, name)
    .where({ field_name: field })
    .first();
  if (current) {
    return current;
  }
  const exists = await db.schema.withSchema("public").hasColumn(table, field);
  if (exists) {
    throw new ProtectedFieldError(field);
  }
  throw new CollectionFieldNotFoundError(field);
}

export async function saveSystemField(
  db: Knex,
  name: string,
  field: string,
  body: unknown,
  create: boolean,
) {
  const column = parseCustomFieldName(field);
  return db.transaction(async (transaction) => {
    const collection = await lockSystemCollection(
      transaction,
      name,
      "ACCESS EXCLUSIVE",
    );
    if (
      create &&
      (await transaction.schema
        .withSchema("public")
        .hasColumn(collection.table, column))
    ) {
      const owned = await customFields(transaction, name)
        .where({ field_name: column })
        .first();
      if (!owned) {
        throw new ProtectedFieldError(column);
      }
      throw new CollectionFieldConflictError("Field already exists");
    }
    const current = create
      ? undefined
      : await ownedField(transaction, name, column, collection.table);
    const { definition, presentation } = await parseCustomFieldConfiguration(
      transaction,
      column,
      body,
      current,
    );
    if (create) {
      await transaction.schema
        .withSchema("public")
        .alterTable(collection.table, (table) =>
          addFieldColumn(table, definition),
        );
      await addSystemRelationConstraint(
        transaction,
        collection.table,
        definition,
      );
      await transaction("public.asmblyr_system_fields").insert({
        collection_name: name,
        field_name: column,
        definition: JSON.stringify(definition),
        presentation: JSON.stringify(presentation),
      });
    } else {
      if (definition.defaultValue === undefined) {
        await transaction.raw("ALTER TABLE ?? ALTER COLUMN ?? DROP DEFAULT", [
          `public.${collection.table}`,
          column,
        ]);
      } else {
        const value =
          definition.type === "json"
            ? JSON.stringify(definition.defaultValue)
            : String(definition.defaultValue);
        const literal = await transaction.raw<{ rows: { value: string }[] }>(
          "SELECT quote_literal(?::text) AS value",
          [value],
        );
        await transaction.raw(
          `ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT ${literal.rows[0].value}`,
          [`public.${collection.table}`, column],
        );
      }
      await transaction("public.asmblyr_system_fields")
        .where({ collection_name: name, field_name: column })
        .update({
          definition: JSON.stringify(definition),
          presentation: JSON.stringify(presentation),
        });
    }
    return readSystemCollection(transaction, name);
  });
}

export async function deleteSystemField(db: Knex, name: string, field: string) {
  const column = parseCustomFieldName(field);
  try {
    await db.transaction(async (transaction) => {
      const collection = await lockSystemCollection(
        transaction,
        name,
        "ACCESS EXCLUSIVE",
      );
      await ownedField(transaction, name, column, collection.table);
      // No CASCADE: dependent views/constraints must never be silently removed.
      await transaction.raw("ALTER TABLE ?? DROP COLUMN ?? RESTRICT", [
        `public.${collection.table}`,
        column,
      ]);
      await customFields(transaction, name)
        .where({ field_name: column })
        .delete();
    });
  } catch (error) {
    if (postgresCode(error) === "2BP01") {
      throw new CollectionDependencyError();
    }
    throw error;
  }
}
