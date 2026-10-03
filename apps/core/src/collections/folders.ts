import type { Knex } from "knex";
import { parseFolderId } from "./validation.js";
import { lockCollectionOrder, nextSortOrder } from "./ordering.js";

export interface CollectionFolder {
  id: string;
  name: string;
}

class FolderError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function parseId(value: unknown): string {
  const id = parseFolderId(value);
  if (!id) throw new FolderError("Invalid folder ID", 400);
  return id;
}

function parseName(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "name")
  ) {
    throw new FolderError("Expected folder name", 400);
  }
  const name = (body as { name?: unknown }).name;
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 120 ||
    /[\x00-\x1f\x7f]/.test(name)
  ) {
    throw new FolderError(
      "Folder name must contain 1–120 printable characters",
      400,
    );
  }
  return name.trim();
}

function folderConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new FolderError("Folder already exists", 409);
  }
  throw error;
}

export async function listFolders(database: Knex): Promise<CollectionFolder[]> {
  return database<CollectionFolder>("asmblyr_collection_folders")
    .withSchema("public")
    .select("id", "name")
    .orderBy("sort_order")
    .orderByRaw("lower(name), id");
}

export async function createFolder(
  database: Knex,
  body: unknown,
): Promise<CollectionFolder> {
  const name = parseName(body);
  try {
    return await database.transaction(async (transaction) => {
      await lockCollectionOrder(transaction);
      const result = await transaction.raw<{ rows: { next: number }[] }>(`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM public.asmblyr_collection_folders
      `);
      const [folder] = await transaction("asmblyr_collection_folders")
        .withSchema("public")
        .insert({ name, sort_order: result.rows[0].next })
        .returning<CollectionFolder[]>(["id", "name"]);
      return folder;
    });
  } catch (error) {
    return folderConflict(error);
  }
}

export async function reorderFolder(
  database: Knex,
  idInput: unknown,
  body: unknown,
): Promise<CollectionFolder> {
  const id = parseId(idInput);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "before")
  ) {
    throw new FolderError("Expected optional before folder ID", 400);
  }
  const rawBefore = (body as { before?: unknown }).before;
  const before =
    rawBefore === undefined || rawBefore === null ? null : parseId(rawBefore);
  return database.transaction(async (transaction) => {
    await lockCollectionOrder(transaction);
    const rows = await transaction("asmblyr_collection_folders")
      .withSchema("public")
      .select("id", "name", "sort_order")
      .orderBy("sort_order")
      .orderByRaw("lower(name), id");
    const folder = rows.find((row) => row.id === id);
    if (!folder) throw new FolderError("Folder not found", 404);
    if (before === id) return { id, name: folder.name };
    const ordered = rows.filter((row) => row.id !== id);
    const index =
      before === null
        ? ordered.length
        : ordered.findIndex((row) => row.id === before);
    if (index < 0) throw new FolderError("Before folder not found", 400);
    ordered.splice(index, 0, folder);
    for (const [sortOrder, row] of ordered.entries()) {
      if (row.sort_order === sortOrder) continue;
      await transaction("asmblyr_collection_folders")
        .withSchema("public")
        .where({ id: row.id })
        .update({ sort_order: sortOrder });
    }
    return { id, name: folder.name };
  });
}

export async function renameFolder(
  database: Knex,
  idInput: unknown,
  body: unknown,
): Promise<CollectionFolder> {
  const id = parseId(idInput);
  const name = parseName(body);
  try {
    const [folder] = await database("asmblyr_collection_folders")
      .withSchema("public")
      .where({ id })
      .update({ name })
      .returning<CollectionFolder[]>(["id", "name"]);
    if (!folder) throw new FolderError("Folder not found", 404);
    return folder;
  } catch (error) {
    return folderConflict(error);
  }
}

export async function deleteFolder(
  database: Knex,
  idInput: unknown,
): Promise<void> {
  const id = parseId(idInput);
  await database.transaction(async (transaction) => {
    await lockCollectionOrder(transaction);
    const folder = await transaction("asmblyr_collection_folders")
      .withSchema("public")
      .where({ id })
      .first("id");
    if (!folder) throw new FolderError("Folder not found", 404);
    const children = await transaction("asmblyr_collections")
      .withSchema("public")
      .where({ folder_id: id })
      .select("name")
      .orderBy("sort_order")
      .orderBy("name");
    const next = await nextSortOrder(transaction, null);
    for (const [index, collection] of children.entries()) {
      await transaction("asmblyr_collections")
        .withSchema("public")
        .where({ name: collection.name })
        .update({ folder_id: null, sort_order: next + index });
    }
    await transaction("asmblyr_collection_folders")
      .withSchema("public")
      .where({ id })
      .delete();
  });
}
