import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import {
  grantFor,
  AccessDeniedError,
  type Access,
} from "../permissions/access.js";
import { listCollections } from "../collections/catalog-repository.js";
import type { ItemField } from "../items/types.js";
import type { MutationContext } from "../items/events-repository.js";
import { ItemError } from "../items/validation.js";
import { files } from "./repository.js";
import { effectiveSettingsAccess } from "../settings/access.js";

const references = (db: Knex) =>
  db("asmblyr_file_references").withSchema("public");
const idsIn = (value: unknown) =>
  typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? (value as string[])
      : [];

export async function validateFileWrites(
  db: Knex,
  values: Record<string, unknown>,
  fields: Map<string, ItemField>,
  actor: MutationContext["actor"],
  before?: Record<string, unknown>,
) {
  const ids = [
    ...new Set(
      [...fields.values()]
        .filter((f) => f.type === "file" || f.type === "files")
        .flatMap((f) => idsIn(values[f.name])),
    ),
  ].sort();
  if (!ids.length) return;
  const user =
    actor.kind === "user"
      ? await db("asmblyr_users")
          .where({ id: actor.id, status: "active" })
          .first("superuser")
      : null;
  if (
    !user?.superuser &&
    [...fields.values()]
      .filter((f) => f.type === "file" || f.type === "files")
      .some((f) =>
        idsIn(values[f.name]).some(
          (id) => !idsIn(before?.[f.name]).includes(id),
        ),
      )
  ) {
    const access =
      user && actor.kind === "user"
        ? await effectiveSettingsAccess(db, actor.id)
        : null;
    if (!access?.sections.includes("files")) {
      throw new AccessDeniedError();
    }
  }
  const rows = await files(db)
    .whereIn("id", ids)
    .orderBy("id")
    .forShare()
    .select("id", "status");
  if (
    rows.length !== ids.length ||
    rows.some((row) => row.status !== "ready")
  ) {
    throw new ItemError("Some files are unavailable; select ready files", 409);
  }
}

export async function syncFileReferences(
  db: Knex,
  collectionId: string,
  itemId: string,
  fields: Map<string, ItemField>,
  item: Record<string, unknown> | null,
) {
  await references(db)
    .where({ collection_id: collectionId, item_id: itemId })
    .delete();
  if (!item) return;
  const rows = [...fields.values()]
    .filter((f) => f.type === "file" || f.type === "files")
    .flatMap((f) =>
      idsIn(item[f.name]).map((id) => ({
        collection_id: collectionId,
        item_id: itemId,
        field_name: f.name,
        file_id: id,
      })),
    );
  if (rows.length) await references(db).insert(rows);
}

/** Check live rows as well: SQL edits/cascades can make the API reference index stale. */
export async function actualFileReferences(db: Knex, id: string) {
  const catalog = await listCollections(db);
  const result: { collection: string; field: string; itemId: string }[] = [];
  for (const collection of catalog) {
    for (const field of collection.fields.filter(
      (f) => f.type === "file" || f.type === "files",
    )) {
      const row = await db(collection.name)
        .withSchema("public")
        .modify((q) => {
          if (field.type === "file") q.where(field.name, id);
          else q.whereRaw("?? @> ?::jsonb", [field.name, JSON.stringify([id])]);
        })
        .first(collection.primaryKey.name);
      if (row)
        result.push({
          collection: collection.name,
          field: field.name,
          itemId: String(row[collection.primaryKey.name]),
        });
    }
  }
  return result;
}

export async function requireFileRead(
  db: Knex,
  id: string,
  access: Access,
  catalog?: Awaited<ReturnType<typeof listCollections>>,
) {
  if (access.principal.superuser) return;
  if (
    access.principal.kind === "user" &&
    (await effectiveSettingsAccess(db, access.principal.id)).sections.includes(
      "files",
    )
  ) {
    return;
  }
  const candidates = await references(db)
    .where({ file_id: id })
    .join("asmblyr_collections as c", "c.id", "collection_id")
    .select("c.name", "item_id", "field_name");
  const collections =
    catalog ?? (candidates.length ? await listCollections(db) : []);
  for (const candidate of candidates) {
    const allowed = grantFor(access, candidate.name, "read");
    if (
      !allowed ||
      (!allowed.includes("*") && !allowed.includes(candidate.field_name))
    )
      continue;
    const collection = collections.find((c) => c.name === candidate.name);
    const field = collection?.fields.find(
      (f) => f.name === candidate.field_name,
    );
    if (!collection || !field || !["file", "files"].includes(field.type))
      continue;
    const item = await db(collection.name)
      .withSchema("public")
      .where(collection.primaryKey.name, candidate.item_id)
      .modify((query) =>
        applyRowAccess(query, db, access, collection.name, "read", [
          field.name,
        ]),
      )
      .first(field.name);
    if (item && idsIn(item[field.name]).includes(id)) return;
  }
  // The identifier itself never grants access, including to unlinked or deleted files.
  throw Object.assign(new Error("File not found"), { statusCode: 404 });
}
