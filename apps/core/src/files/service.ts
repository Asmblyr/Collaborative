import { createHash, randomUUID } from "node:crypto";
import type { Knex } from "knex";
import {
  files,
  fileEvent,
  publicFile,
  type FileActor,
  type FileRow,
} from "./repository.js";
import { fileError, rasterType } from "./validation.js";
import { StorageError, type FileStorage } from "./storage/types.js";
import { actualFileReferences } from "./references.js";

function assertStorage(
  storage: FileStorage | null,
  row?: FileRow,
): FileStorage {
  if (!storage || (row && row.storage !== storage.id)) throw new StorageError();
  return storage;
}

export async function uploadFile(
  db: Knex,
  storage: FileStorage | null,
  content: Buffer,
  input: { filename: string; mimeType: string },
  actor: FileActor,
) {
  const provider = assertStorage(storage);
  const id = randomUUID(),
    previewType = rasterType(content);
  // Persist intent before S3. If a PUT times out or the process dies, an administrator can clean up by ID.
  await files(db).insert({
    id,
    storage: provider.id,
    object_key: `files/${id}`,
    filename: input.filename,
    title: input.filename,
    mime_type: previewType ?? input.mimeType,
    preview_type: previewType,
    size: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    uploaded_by: actor.id,
  });
  try {
    return await db.transaction(async (trx) => {
      const row = (await files(trx).where({ id }).forUpdate().first())!;
      await provider.put(row.object_key, content, row.mime_type);
      const [saved] = await files(trx)
        .where({ id })
        .update({ status: "ready", updated_at: trx.fn.now() })
        .returning("*");
      await fileEvent(trx, id, actor, "create", {
        filename: row.filename,
        size: Number(row.size),
        mimeType: row.mime_type,
      });
      return publicFile(saved);
    });
  } catch {
    await files(db)
      .where({ id, status: "uploading" })
      .update({ status: "failed", updated_at: db.fn.now() });
    throw new StorageError();
  }
}

export async function updateFile(
  db: Knex,
  id: string,
  patch: { title?: string; description?: string },
  actor: FileActor,
) {
  return db.transaction(async (trx) => {
    const row = await files(trx).where({ id }).forUpdate().first();
    if (!row) throw fileError("Файл не найден", 404);
    if (row.status !== "ready")
      throw fileError("Файл пока недоступен для редактирования", 409);
    const changes = Object.fromEntries(
      Object.entries(patch)
        .filter(([k, v]) => row[k as keyof typeof patch] !== v)
        .map(([key, value]) => [
          key,
          { before: row[key as keyof typeof patch], after: value },
        ]),
    );
    if (!Object.keys(changes).length) return publicFile(row);
    const [saved] = await files(trx)
      .where({ id })
      .update({ ...patch, updated_at: trx.fn.now() })
      .returning("*");
    await fileEvent(trx, id, actor, "update", changes);
    return publicFile(saved);
  });
}

export async function deleteFile(
  db: Knex,
  storage: FileStorage | null,
  id: string,
  actor: FileActor,
) {
  const row = await db.transaction(async (trx) => {
    const current = await files(trx).where({ id }).forUpdate().first();
    if (!current) return null;
    if ((await actualFileReferences(trx, id)).length) {
      throw fileError(
        "Файл используется в записях. Сначала уберите его привязки.",
        409,
      );
    }
    // Remove stale index rows left by direct SQL or foreign-key cascades.
    await trx("asmblyr_file_references")
      .withSchema("public")
      .where({ file_id: id })
      .delete();
    assertStorage(storage, current);
    if (
      current.status === "uploading" &&
      Date.now() - new Date(current.created_at).getTime() < 15 * 60000
    ) {
      throw fileError("Загрузка ещё выполняется. Повторите позже.", 409);
    }
    await files(trx)
      .where({ id })
      .update({ status: "deleting", updated_at: trx.fn.now() });
    return current;
  });
  if (!row) return;
  // Tombstone is committed before deleting bytes. Retry is safe even if S3 or the process fails.
  await assertStorage(storage, row).delete(row.object_key);
  await db.transaction(async (trx) => {
    const removed = await files(trx)
      .where({ id, status: "deleting" })
      .delete()
      .returning("id");
    if (removed.length)
      await fileEvent(trx, id, actor, "delete", {
        filename: row.filename,
        title: row.title,
        size: Number(row.size),
        sha256: row.sha256,
      });
  });
}

export async function fileContent(
  db: Knex,
  storage: FileStorage | null,
  id: string,
  preview: boolean,
) {
  const row = await files(db).where({ id }).first();
  if (!row || row.status !== "ready")
    throw fileError("Файл не найден или недоступен", 404);
  if (preview && !row.preview_type)
    throw fileError("Для этого файла доступно только скачивание", 400);
  const stream = await assertStorage(storage, row).get(row.object_key);
  return { row, stream };
}
