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
import {
  resolveRuntime,
  type RuntimeSource,
} from "../shared/runtime-source.js";

async function assertStorage(
  source: RuntimeSource<FileStorage>,
  row?: FileRow,
  database?: Knex,
): Promise<FileStorage> {
  const storage =
    database && typeof source === "function"
      ? await (source as (database?: Knex) => Promise<FileStorage | null>)(
          database,
        )
      : await resolveRuntime(source);
  if (!storage || (row && row.storage !== storage.id)) throw new StorageError();
  return storage;
}

export async function uploadFile(
  db: Knex,
  storage: RuntimeSource<FileStorage>,
  content: Buffer,
  input: { filename: string; mimeType: string },
  actor: FileActor,
) {
  const id = randomUUID(),
    previewType = rasterType(content);
  // Persist intent before S3. If a PUT times out or the process dies, an administrator can clean up by ID.
  const provider = await db.transaction(async (trx) => {
    if (typeof storage === "function") {
      // Synchronize the upload intent with changes to the storage location.
      await trx("asmblyr_integration_settings")
        .withSchema("public")
        .where({ id: 1 })
        .forShare()
        .first();
    }
    const provider = await assertStorage(storage, undefined, trx);
    await files(trx).insert({
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
    return provider;
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
  patch: {
    title?: string;
    description?: string;
    visibility?: "private" | "public";
  },
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
  storage: RuntimeSource<FileStorage>,
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
    const provider = await assertStorage(storage, current);
    if (
      current.status === "uploading" &&
      Date.now() - new Date(current.created_at).getTime() < 15 * 60000
    ) {
      throw fileError("Загрузка ещё выполняется. Повторите позже.", 409);
    }
    await files(trx)
      .where({ id })
      .update({ status: "deleting", updated_at: trx.fn.now() });
    return { current, provider };
  });
  if (!row) return;
  // Tombstone is committed before deleting bytes. Retry is safe even if S3 or the process fails.
  await row.provider.delete(row.current.object_key);
  await db.transaction(async (trx) => {
    const removed = await files(trx)
      .where({ id, status: "deleting" })
      .delete()
      .returning("id");
    if (removed.length)
      await fileEvent(trx, id, actor, "delete", {
        filename: row.current.filename,
        title: row.current.title,
        size: Number(row.current.size),
        sha256: row.current.sha256,
      });
  });
}

export async function fileContent(
  db: Knex,
  storage: RuntimeSource<FileStorage>,
  id: string,
  preview: boolean,
  publicOnly = false,
) {
  const row = await files(db).where({ id }).first();
  if (
    !row ||
    row.status !== "ready" ||
    (publicOnly && row.visibility !== "public")
  )
    throw fileError("Файл не найден или недоступен", 404);
  if (preview && !row.preview_type)
    throw fileError("Для этого файла доступно только скачивание", 400);
  const stream = await (await assertStorage(storage, row)).get(row.object_key);
  return { row, stream };
}
