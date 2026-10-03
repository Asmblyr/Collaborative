import type { Knex } from "knex";
import { CollectionInputError, CollectionNotFoundError, parseFolderId, parseMutableCollectionName } from "./validation.js";

export interface CollectionLocation { folderId: string | null; parentCollection: string | null }

export function parseCollectionLocation(input: { folderId?: unknown; parentCollection?: unknown }): CollectionLocation {
  const folderId = parseFolderId(input.folderId);
  const parentCollection = input.parentCollection === undefined || input.parentCollection === null
    ? null : parseMutableCollectionName(input.parentCollection);
  if (folderId && parentCollection) throw new CollectionInputError("Choose a folder or a parent collection, not both");
  return { folderId, parentCollection };
}

// Call under the collection-order lock, including create, move and delete.
export async function validateCollectionLocation(transaction: Knex.Transaction, name: string, location: CollectionLocation) {
  if (location.folderId) {
    const folder = await transaction("asmblyr_collection_folders").withSchema("public")
      .where({ id: location.folderId }).first("id");
    if (!folder) throw Object.assign(new Error("Folder not found"), { statusCode: 404 });
  }
  const rows = await transaction("asmblyr_collections").withSchema("public")
    .select<{ name: string; parent_collection: string | null }[]>("name", "parent_collection");
  const parents = new Map(rows.map((row) => [row.name, row.parent_collection]));
  const visited = new Set([name]);
  let parent = location.parentCollection;
  while (parent) {
    if (visited.has(parent)) throw new CollectionInputError("A collection cannot be nested inside itself or its descendants");
    visited.add(parent);
    if (!parents.has(parent)) throw new CollectionNotFoundError(parent);
    parent = parents.get(parent) ?? null;
  }
}
