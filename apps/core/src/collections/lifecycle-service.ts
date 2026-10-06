import type { Knex } from "knex";
import { assertCollectionWritable } from "./source-access.js";
import {
  findCollectionSettings,
  lockedCollectionSettings,
  isManagedColumn,
} from "./settings-repository.js";
import { removePresentationField } from "./presentation-cleanup.js";
import { lockCollectionOrder, promoteCollectionChildren } from "./ordering.js";
import {
  CollectionDependencyError,
  CollectionFieldNotFoundError,
  CollectionNotFoundError,
  ProtectedFieldError,
  parseMutableCollectionName,
  parseMutableFieldName,
} from "./validation.js";

function postgresCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

async function requireCollection(database: Knex, name: string) {
  const settings = await findCollectionSettings(database, name);
  if (!settings) {
    throw new CollectionNotFoundError(name);
  }
  return settings;
}

async function requireEditableField(
  database: Knex,
  collection: string,
  field: string,
): Promise<void> {
  const settings = await requireCollection(database, collection);
  if (isManagedColumn(settings, field)) {
    throw new ProtectedFieldError(field);
  }
  const exists = await database.schema
    .withSchema("public")
    .hasColumn(collection, field);
  if (!exists) {
    throw new CollectionFieldNotFoundError(field);
  }
}

async function removeFieldGrants(
  transaction: Knex.Transaction,
  collectionId: string,
  field: string,
): Promise<void> {
  const grants = await transaction("asmblyr_permissions")
    .withSchema("public")
    .where({ collection_id: collectionId })
    .whereRaw("? = ANY(fields)", [field])
    .forUpdate()
    .select<{ id: string; fields: string[] }[]>("id", "fields");
  for (const grant of grants) {
    const fields = grant.fields.filter((name) => name !== field);
    if (fields.length === 0) {
      await transaction("asmblyr_permissions")
        .withSchema("public")
        .where({ id: grant.id })
        .delete();
    } else {
      await transaction("asmblyr_permissions")
        .withSchema("public")
        .where({ id: grant.id })
        .update({ fields });
    }
  }
}

export async function collectionDeleteImpact(database: Knex, input: unknown) {
  const name = parseMutableCollectionName(input);
  try {
    await requireCollection(database, name);
    const result = await database.raw<{ rows: { item_count: string }[] }>(
      "SELECT count(*)::text AS item_count FROM ??",
      [`public.${name}`],
    );
    return { itemCount: result.rows[0].item_count };
  } catch (error) {
    if (postgresCode(error) === "42P01") {
      throw new CollectionNotFoundError(name);
    }
    throw error;
  }
}

export async function fieldDeleteImpact(
  database: Knex,
  collectionInput: unknown,
  fieldInput: unknown,
) {
  const collection = parseMutableCollectionName(collectionInput);
  const field = parseMutableFieldName(fieldInput);
  try {
    const alias = await database("asmblyr_relation_aliases")
      .withSchema("public")
      .where({ collection_name: collection, field_name: field })
      .first<{
        through_collection: string;
        through_field: string;
      }>("through_collection", "through_field");
    if (alias) {
      const count = await database.raw<{ rows: { item_count: string }[] }>(
        "SELECT count(*)::text AS item_count FROM ??",
        [`public.${collection}`],
      );
      return {
        itemCount: count.rows[0].item_count,
        populatedCount: "0",
        virtual: true,
      };
    }
    await requireEditableField(database, collection, field);
    const result = await database.raw<{
      rows: { item_count: string; populated_count: string }[];
    }>(
      "SELECT count(*)::text AS item_count, count(??)::text AS populated_count FROM ??",
      [field, `public.${collection}`],
    );
    return {
      itemCount: result.rows[0].item_count,
      populatedCount: result.rows[0].populated_count,
    };
  } catch (error) {
    if (postgresCode(error) === "42P01") {
      throw new CollectionNotFoundError(collection);
    }
    if (postgresCode(error) === "42703") {
      throw new CollectionFieldNotFoundError(field);
    }
    throw error;
  }
}

export async function deleteCollectionField(
  database: Knex,
  collectionInput: unknown,
  fieldInput: unknown,
): Promise<void> {
  const collection = parseMutableCollectionName(collectionInput);
  const field = parseMutableFieldName(fieldInput);
  try {
    await database.transaction(async (transaction) => {
      const settings = await lockedCollectionSettings(transaction, collection);
      if (isManagedColumn(settings, field)) {
        throw new ProtectedFieldError(field);
      }
      const alias = await transaction("asmblyr_relation_aliases")
        .withSchema("public")
        .where({ collection_name: collection, field_name: field })
        .first("field_name");
      if (alias) {
        await transaction("asmblyr_relation_aliases")
          .withSchema("public")
          .where({ collection_name: collection, field_name: field })
          .delete();
        await transaction("asmblyr_field_metadata")
          .withSchema("public")
          .where({ collection_name: collection, field_name: field })
          .delete();
        await removeFieldGrants(transaction, settings.internalId, field);
        return;
      }
      const exists = await transaction.schema
        .withSchema("public")
        .hasColumn(collection, field);
      if (!exists) {
        throw new CollectionFieldNotFoundError(field);
      }
      await transaction.raw("ALTER TABLE ?? DROP COLUMN ?? RESTRICT", [
        `public.${collection}`,
        field,
      ]);
      await removePresentationField(transaction, collection, field);
      await transaction("asmblyr_collections")
        .withSchema("public")
        .where({ name: collection, display_field: field })
        .update({ display_field: null });
      const affectedAliases = await transaction("asmblyr_relation_aliases")
        .withSchema("public")
        .where({ through_collection: collection })
        .andWhere((query) =>
          query
            .where({ through_field: field })
            .orWhere({ related_field: field }),
        )
        .select<{ collection_name: string; field_name: string }[]>(
          "collection_name",
          "field_name",
        );
      await transaction("asmblyr_relation_aliases")
        .withSchema("public")
        .where({ through_collection: collection })
        .andWhere((query) =>
          query
            .where({ through_field: field })
            .orWhere({ related_field: field }),
        )
        .delete();
      for (const affected of affectedAliases) {
        await transaction("asmblyr_field_metadata")
          .withSchema("public")
          .where({
            collection_name: affected.collection_name,
            field_name: affected.field_name,
          })
          .delete();
        const parent = await requireCollection(
          transaction,
          affected.collection_name,
        );
        await removeFieldGrants(
          transaction,
          parent.internalId,
          affected.field_name,
        );
      }
      await transaction("asmblyr_relations")
        .withSchema("public")
        .where({ source_collection: collection, source_field: field })
        .delete();
      await transaction("asmblyr_field_metadata")
        .withSchema("public")
        .where({ collection_name: collection, field_name: field })
        .delete();
      await transaction("asmblyr_file_references")
        .withSchema("public")
        .where({ collection_id: settings.internalId, field_name: field })
        .delete();
      await removeFieldGrants(transaction, settings.internalId, field);
    });
  } catch (error) {
    if (postgresCode(error) === "42P01") {
      throw new CollectionNotFoundError(collection);
    }
    if (postgresCode(error) === "42703") {
      throw new CollectionFieldNotFoundError(field);
    }
    if (postgresCode(error) === "2BP01") {
      throw new CollectionDependencyError();
    }
    throw error;
  }
}

export async function deleteCollection(
  database: Knex,
  input: unknown,
  onDeleted?: (
    transaction: Knex.Transaction,
    target: { collection: string; collectionId: string },
  ) => Promise<void>,
): Promise<void> {
  const name = parseMutableCollectionName(input);
  try {
    await database.transaction(async (transaction) => {
      await lockCollectionOrder(transaction);
      const settings = await requireCollection(transaction, name);
      assertCollectionWritable(settings);
      const profileBinding = await transaction(
        "public.asmblyr_profile_extension",
      )
        .where({ collection_id: settings.internalId })
        .first("id");
      if (profileBinding) {
        throw new CollectionDependencyError(
          "Disconnect this collection from user profiles before deleting it",
        );
      }
      await transaction.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [
        `public.${name}`,
      ]);
      const affectedAliases = await transaction("asmblyr_relation_aliases")
        .withSchema("public")
        .where({ related_collection: name })
        .orWhere({ through_collection: name })
        .select<
          { collection_name: string; field_name: string }[]
        >("collection_name", "field_name");
      await transaction.raw("DROP TABLE ?? RESTRICT", [`public.${name}`]);
      for (const affected of affectedAliases) {
        await transaction("asmblyr_field_metadata")
          .withSchema("public")
          .where({
            collection_name: affected.collection_name,
            field_name: affected.field_name,
          })
          .delete();
        if (affected.collection_name === name) {
          continue;
        }
        const parent = await requireCollection(
          transaction,
          affected.collection_name,
        );
        await removeFieldGrants(
          transaction,
          parent.internalId,
          affected.field_name,
        );
      }
      await promoteCollectionChildren(transaction, name);
      await transaction("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .delete();
      await onDeleted?.(transaction, {
        collection: name,
        collectionId: settings.internalId,
      });
    });
  } catch (error) {
    if (postgresCode(error) === "42P01") {
      throw new CollectionNotFoundError(name);
    }
    if (["2BP01", "23503"].includes(postgresCode(error) ?? "")) {
      throw new CollectionDependencyError();
    }
    throw error;
  }
}
