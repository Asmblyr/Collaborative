import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { requireGrant } from "../permissions/access.js";
import { assertRowWrite } from "../permissions/row-access.js";
import { collectionSchema } from "../items/schema-repository.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { ItemError, parseCollectionName } from "../items/validation.js";
import { presenceKey } from "../presence/access.js";
import { parsePresenceClient } from "../presence/input.js";
import { publishRealtime, realtimeEvent } from "./publish.js";

export const lockLeaseSeconds = 30;

export interface LockInput {
  collection: string;
  recordId: string;
  field: string;
  clientId: string;
}

export function parseLockInput(input: unknown): LockInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ItemError("Invalid lock request", 400);
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) => !["collection", "recordId", "field", "clientId"].includes(key),
    )
  ) {
    throw new ItemError("Invalid lock request", 400);
  }
  if (
    typeof value.collection !== "string" ||
    typeof value.recordId !== "string" ||
    value.recordId.length < 1 ||
    value.recordId.length > 255 ||
    typeof value.field !== "string" ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(value.field)
  ) {
    throw new ItemError("Invalid lock request", 400);
  }
  return {
    collection: parseCollectionName(value.collection),
    recordId: value.recordId,
    field: value.field,
    clientId: parsePresenceClient(value.clientId),
  };
}

async function authorizedLock(db: Knex, access: Access, input: LockInput) {
  if (access.principal.kind !== "user") {
    throw new ItemError("Human session required", 403);
  }
  const key = await presenceKey(db, access, {
    kind: "record",
    collection: input.collection,
    id: input.recordId,
  });
  const [, collectionId, recordId] = JSON.parse(key) as [
    string,
    string,
    string,
  ];
  const schema = await collectionSchema(db, input.collection);
  const fields = requireGrant(access, input.collection, "update");
  if (
    !schema.fields.has(input.field) ||
    (!fields.includes("*") && !fields.includes(input.field))
  ) {
    throw new ItemError("Field cannot be edited", 403);
  }
  await assertRowWrite(
    db,
    access,
    input.collection,
    "update",
    schema.settings.primaryKey.name,
    recordId,
    [input.field],
  );
  return { collectionId, recordId };
}

export async function acquireLock(db: Knex, access: Access, input: LockInput) {
  const { collectionId, recordId } = await authorizedLock(db, access, input);
  if (access.principal.kind !== "user") {
    throw new ItemError("Human session required", 403);
  }
  const user = access.principal;
  const result = await db.raw<{
    rows: { expires_at: Date; created_at: Date }[];
  }>(
    `INSERT INTO public.asmblyr_field_locks
      (collection_id, record_id, field, session_id, client_id, user_id, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP + ? * INTERVAL '1 second')
     ON CONFLICT (collection_id, record_id, field) DO UPDATE SET
       expires_at = EXCLUDED.expires_at,
       session_id = EXCLUDED.session_id,
       client_id = EXCLUDED.client_id,
       user_id = EXCLUDED.user_id,
       created_at = CASE WHEN asmblyr_field_locks.expires_at <= CURRENT_TIMESTAMP
         THEN CURRENT_TIMESTAMP ELSE asmblyr_field_locks.created_at END
     WHERE asmblyr_field_locks.expires_at <= CURRENT_TIMESTAMP OR
       (asmblyr_field_locks.session_id = EXCLUDED.session_id AND
        asmblyr_field_locks.client_id = EXCLUDED.client_id)
     RETURNING expires_at, created_at`,
    [
      collectionId,
      recordId,
      input.field,
      user.sessionId,
      input.clientId,
      user.id,
      lockLeaseSeconds,
    ],
  );
  if (!result.rows.length) {
    throw new ItemError("Field is being edited", 409, "FIELD_LOCKED");
  }
  const person = await db("public.asmblyr_users")
    .where({ id: user.id })
    .first<{ display_name: string | null }>("display_name");
  const expiresAt = result.rows[0].expires_at.toISOString();
  await publishRealtime(
    db,
    realtimeEvent(
      "field.locked",
      { kind: "user", id: user.id },
      {
        collection: input.collection,
        recordId,
        field: input.field,
        holder: {
          id: user.id,
          displayName: person?.display_name || "Участник",
        },
        expiresAt,
      },
    ),
  );
  return {
    data: {
      collection: input.collection,
      recordId,
      field: input.field,
      userId: user.id,
      sessionId: user.sessionId,
      clientId: input.clientId,
      createdAt: result.rows[0].created_at.toISOString(),
      expiresAt,
    },
  };
}

export async function releaseLock(
  db: Knex,
  access: Access,
  input: LockInput,
): Promise<void> {
  if (access.principal.kind !== "user") {
    throw new ItemError("Human session required", 403);
  }
  // A revoked editor still needs to release its own lease immediately.
  const settings = await findCollectionSettings(
    db,
    parseCollectionName(input.collection),
  );
  if (!settings) return;
  const collectionId = settings.internalId;
  const recordId = input.recordId;
  const removed = await db("public.asmblyr_field_locks")
    .where({
      collection_id: collectionId,
      record_id: recordId,
      field: input.field,
      session_id: access.principal.sessionId,
      client_id: input.clientId,
    })
    .delete();
  if (removed) {
    await publishRealtime(
      db,
      realtimeEvent(
        "field.unlocked",
        { kind: "user", id: access.principal.id },
        {
          collection: input.collection,
          recordId,
          field: input.field,
          holder: { id: access.principal.id, displayName: "" },
          expiresAt: new Date().toISOString(),
        },
      ),
    );
  }
}

export async function releaseClientLocks(
  db: Knex,
  sessionId: string,
  clientId: string,
): Promise<void> {
  const rows = await db("public.asmblyr_field_locks as lock")
    .join(
      "public.asmblyr_collections as collection",
      "collection.id",
      "lock.collection_id",
    )
    .where({ "lock.session_id": sessionId, "lock.client_id": clientId })
    .select(
      "collection.name",
      "lock.record_id",
      "lock.field",
      "lock.user_id",
      "lock.collection_id",
    );
  for (const row of rows) {
    const removed = await db("public.asmblyr_field_locks")
      .where({
        collection_id: row.collection_id,
        record_id: row.record_id,
        field: row.field,
        session_id: sessionId,
        client_id: clientId,
      })
      .delete();
    if (removed) {
      await publishRealtime(
        db,
        realtimeEvent(
          "field.unlocked",
          { kind: "user", id: row.user_id },
          {
            collection: row.name,
            recordId: row.record_id,
            field: row.field,
            holder: { id: row.user_id, displayName: "" },
            expiresAt: new Date().toISOString(),
          },
        ),
      );
    }
  }
}

export async function expireLocks(db: Knex): Promise<void> {
  const expired = await db("public.asmblyr_field_locks")
    .where("expires_at", "<=", db.fn.now())
    .delete()
    .returning<
      {
        collection_id: string;
        record_id: string;
        field: string;
        user_id: string;
      }[]
    >(["collection_id", "record_id", "field", "user_id"]);
  if (!expired.length) return;
  const collections = await db("public.asmblyr_collections")
    .whereIn("id", [...new Set(expired.map((row) => row.collection_id))])
    .select<{ id: string; name: string }[]>("id", "name");
  const names = new Map(collections.map((row) => [row.id, row.name]));
  for (const row of expired) {
    const collection = names.get(row.collection_id);
    if (collection) {
      await publishRealtime(
        db,
        realtimeEvent(
          "field.unlocked",
          { kind: "user", id: row.user_id },
          {
            collection,
            recordId: row.record_id,
            field: row.field,
            holder: { id: row.user_id, displayName: "" },
            expiresAt: new Date().toISOString(),
          },
        ),
      );
    }
  }
}
