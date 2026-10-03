import type { Knex } from "knex";
import type { CreateCollectionInput } from "./types.js";
import { addFieldColumn, addPrimaryKeyColumn } from "./field-types.js";
import { saveFieldMetadata } from "./field-metadata.js";
import { nextSortOrder } from "./ordering.js";
import { saveCollectionState } from "./state-settings.js";

/** Internal DDL boundary. Callers validate input and hold the collection order lock. */
export async function createCollectionStorage(
  transaction: Knex.Transaction,
  input: CreateCollectionInput,
): Promise<{ id: string; created_at: Date }> {
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
  await transaction.schema.withSchema("public").createTable(name, (table) => {
    addPrimaryKeyColumn(table, primaryKey, transaction);
    if (timestamps.createdAt) {
      table
        .timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(transaction.fn.now());
    }
    if (timestamps.updatedAt) {
      table
        .timestamp("updated_at", { useTz: true })
        .notNullable()
        .defaultTo(transaction.fn.now());
    }
    for (const field of fields) {
      addFieldColumn(table, field);
    }
  });
  const sortOrder = await nextSortOrder(
    transaction,
    folderId,
    parentCollection,
  );
  const [row] = await transaction("asmblyr_collections")
    .withSchema("public")
    .insert({
      name,
      hidden,
      display_name: displayName,
      mcp_enabled: mcp.enabled,
      mcp_description: mcp.description,
      folder_id: folderId,
      parent_collection: parentCollection,
      sort_order: sortOrder,
      mode,
      primary_key_name: primaryKey.name,
      primary_key_type: primaryKey.type,
      created_at_enabled: timestamps.createdAt,
      updated_at_enabled: timestamps.updatedAt,
    })
    .returning<{ id: string; created_at: Date }[]>(["id", "created_at"]);
  await saveFieldMetadata(transaction, name, fields);
  if (state) await saveCollectionState(transaction, name, state);
  if (workspaceId)
    await transaction("asmblyr_workspace_collections")
      .withSchema("public")
      .insert({ workspace_id: workspaceId, collection_id: row.id });
  return row;
}
