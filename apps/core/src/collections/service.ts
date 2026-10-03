import type { Knex } from "knex";
import {
  CollectionConflictError,
  CollectionFieldConflictError,
  CollectionNotFoundError,
  parseCreateCollection,
  parseField,
  parseMutableCollectionName,
} from "./validation.js";
import type { Collection } from "./types.js";
import { addFieldColumn } from "./field-types.js";
import { findCollectionSettings, isManagedColumn } from "./settings-repository.js";
import { listCollections } from "./catalog-repository.js";
import { lockCollectionOrder } from "./ordering.js";
import { parseCollectionLocation, validateCollectionLocation } from "./navigation.js";
import { assertNoAlias } from "./field-name.js";
import { postgresCode } from "../shared/postgres-error.js";
import { createCollectionStorage } from "./create-storage.js";
import { saveFieldMetadata } from "./field-metadata.js";

export { listCollections } from "./catalog-repository.js";
export { updateCollectionField } from "./field-update-service.js";

export async function createCollection(database: Knex, body: unknown): Promise<Collection> {
  const input = parseCreateCollection(body);
  const {
    name,
    displayName,
    hidden,
    mcp,
    folderId,
    parentCollection,
    workspaceId,
    mode,
    primaryKey,
    timestamps,
    state,
    fields,
  } = input;
  const location = parseCollectionLocation({ folderId, parentCollection });

  try {
    const createdAt = await database.transaction(async (transaction) => {
      await lockCollectionOrder(transaction);
      await validateCollectionLocation(transaction, name, location);
      if (
        workspaceId &&
        !(await transaction("asmblyr_workspaces")
          .withSchema("public")
          .where({ id: workspaceId })
          .forShare()
          .first("id"))
      ) {
        throw Object.assign(new Error("Workspace not found"), { statusCode: 404 });
      }
      const row = await createCollectionStorage(transaction, input);
      return row.created_at;
    });

    if (state) {
      const collection = (await listCollections(database)).find((entry) => entry.name === name);
      if (!collection) throw new CollectionNotFoundError(name);
      return collection;
    }
    return {
      name,
      displayName,
      hidden,
      mcp,
      folderId,
      parentCollection,
      mode,
      primaryKey,
      timestamps,
      state,
      fields,
      createdAt,
    };
  } catch (error) {
    if (postgresCode(error) === "23503") {
      throw Object.assign(new Error("Folder not found"), { statusCode: 404 });
    }
    if (postgresCode(error) === "42P07" || postgresCode(error) === "23505") {
      throw new CollectionConflictError(name);
    }
    throw error;
  }
}

export async function addCollectionField(
  database: Knex,
  collectionName: unknown,
  body: unknown,
): Promise<Collection> {
  const name = parseMutableCollectionName(collectionName);
  await addFieldDefinition(database, name, body);
  const collection = (await listCollections(database)).find((entry) => entry.name === name);
  if (!collection) throw new CollectionNotFoundError(name);
  return collection;
}

export async function addFieldDefinition(
  database: Knex,
  collectionName: unknown,
  body: unknown,
): Promise<void> {
  const name = parseMutableCollectionName(collectionName);
  const field = parseField(body);

  try {
    await database.transaction(async (transaction) => {
      const settings = await findCollectionSettings(transaction, name);
      if (!settings) throw new CollectionNotFoundError(name);
      if (isManagedColumn(settings, field.name)) {
        throw new CollectionFieldConflictError(`Field name is managed: ${field.name}`);
      }
      await assertNoAlias(transaction, name, field.name);
      await transaction.schema.withSchema("public").alterTable(name, (table) => {
        addFieldColumn(table, field);
      });
      await saveFieldMetadata(transaction, name, [field]);
    });
  } catch (error) {
    if (postgresCode(error) === "42701") {
      throw new CollectionFieldConflictError(`Field already exists: ${field.name}`);
    }
    if (postgresCode(error) === "23502") {
      throw new CollectionFieldConflictError(
        "A non-nullable field cannot be added while the collection has items",
      );
    }
    throw error;
  }
}
