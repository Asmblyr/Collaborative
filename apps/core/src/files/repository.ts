import type { Knex } from "knex";

export interface FileRow {
  id: string;
  storage: string;
  object_key: string;
  filename: string;
  title: string;
  description: string;
  mime_type: string;
  preview_type: string | null;
  size: string | number;
  sha256: string;
  status: "uploading" | "ready" | "failed" | "deleting";
  uploaded_by: string;
  created_at: Date;
  updated_at: Date;
}

export function files(db: Knex) {
  return db<FileRow>("asmblyr_files").withSchema("public");
}

export function publicFile(row: FileRow) {
  return {
    id: row.id,
    filename: row.filename,
    title: row.title,
    description: row.description,
    mimeType: row.mime_type,
    size: Number(row.size),
    sha256: row.sha256,
    status: row.status,
    previewable: Boolean(row.preview_type),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFiles(
  db: Knex,
  options: { page: number; limit: number; search: string },
) {
  const query = files(db);
  if (options.search) {
    const pattern = `%${options.search.replace(/[\\%_]/g, "\\$&")}%`;
    query.where((q) =>
      q.whereILike("title", pattern).orWhereILike("filename", pattern),
    );
  }
  const [count, rows] = await Promise.all([
    query.clone().count<{ total: string }[]>({ total: "*" }).first(),
    query
      .clone()
      .select("*")
      .orderBy("created_at", "desc")
      .orderBy("id", "desc")
      .limit(options.limit)
      .offset((options.page - 1) * options.limit),
  ]);
  return {
    data: rows.map(publicFile),
    meta: {
      total: Number(count?.total ?? 0),
      page: options.page,
      limit: options.limit,
    },
  };
}

export interface FileActor {
  id: string;
  requestId: string;
}

export async function fileEvent(
  db: Knex,
  fileId: string,
  actor: FileActor,
  action: "create" | "update" | "delete",
  changes: unknown,
) {
  await db("asmblyr_file_events")
    .withSchema("public")
    .insert({
      file_id: fileId,
      actor_id: actor.id,
      request_id: actor.requestId,
      action,
      changes: JSON.stringify(changes),
    });
}

export async function fileEvents(db: Knex, fileId: string) {
  return db("asmblyr_file_events")
    .withSchema("public")
    .where({ file_id: fileId })
    .select(
      "id",
      "actor_id as actorId",
      "action",
      "changes",
      "created_at as createdAt",
    )
    .orderBy("id", "desc")
    .limit(100);
}
