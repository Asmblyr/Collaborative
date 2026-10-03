import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { fieldTypeFromDatabase } from "./field-types.js";
import { findCollectionSettings, isManagedColumn } from "./settings-repository.js";
import {
  CollectionFieldNotFoundError, CollectionInputError, CollectionNotFoundError,
  parseMutableCollectionName, parseMutableFieldName,
} from "./validation.js";

interface SearchSettings { searchable: boolean; indexed: boolean }

function parseSettings(body: unknown): SearchSettings {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CollectionInputError("Expected searchable and indexed boolean settings");
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || typeof value.searchable !== "boolean" ||
    typeof value.indexed !== "boolean") {
    throw new CollectionInputError("Expected searchable and indexed boolean settings");
  }
  return { searchable: value.searchable, indexed: value.indexed };
}

export function searchIndexName(collection: string, field: string): string {
  const hash = createHash("md5").update(`${collection}:${field}`).digest("hex").slice(0, 24);
  return `asmblyr_search_${hash}`;
}

export async function updateFieldSearch(
  database: Knex, collection: unknown, field: unknown, body: unknown,
) {
  const name = parseMutableCollectionName(collection);
  const column = parseMutableFieldName(field);
  const settings = parseSettings(body);
  const index = searchIndexName(name, column);
  // CREATE/DROP INDEX CONCURRENTLY cannot run inside a transaction. Keep one
  // connection and a session lock so requests for this field cannot interleave.
  const connection = await database.client.acquireConnection();
  const raw = (sql: string, bindings: Knex.RawBinding[] = []) =>
    database.raw(sql, bindings).connection(connection);
  try {
    await raw("SELECT pg_advisory_lock(hashtext(?), hashtext(?))", [name, column]);
    const collectionSettings = await findCollectionSettings(database, name);
    if (!collectionSettings) throw new CollectionNotFoundError(name);
    if (isManagedColumn(collectionSettings, column)) {
      throw new CollectionInputError(`Field is managed by Core: ${column}`);
    }
    const result = await raw(`
      SELECT c.data_type, fm.semantic_type, COALESCE(fm.required, FALSE) AS required,
        fm.default_value, r.source_field IS NOT NULL AS is_relation
      FROM information_schema.columns AS c
      LEFT JOIN public.asmblyr_field_metadata AS fm
        ON fm.collection_name = ? AND fm.field_name = c.column_name
      LEFT JOIN public.asmblyr_relations AS r
        ON r.source_collection = ? AND r.source_field = c.column_name
      WHERE c.table_schema = 'public' AND c.table_name = ? AND c.column_name = ?
    `, [name, name, name, column]) as { rows: {
      data_type: string; semantic_type: string | null; required: boolean;
      default_value: unknown; is_relation: boolean;
    }[] };
    const current = result.rows[0];
    if (!current) throw new CollectionFieldNotFoundError(column);
    if (current.is_relation ||
      !["text", "email"].includes(fieldTypeFromDatabase(current.data_type, current.semantic_type) ?? "")) {
      throw new CollectionInputError("Search settings are available only for text and email fields");
    }
    const existing = await raw(`
      SELECT ix.indisvalid AS valid FROM pg_class AS idx
      JOIN pg_namespace AS ns ON ns.oid = idx.relnamespace
      JOIN pg_index AS ix ON ix.indexrelid = idx.oid
      WHERE ns.nspname = 'public' AND idx.relname = ?
    `, [index]) as { rows: { valid: boolean }[] };
    if (existing.rows.length && (!settings.indexed || !existing.rows[0].valid)) {
      await raw("DROP INDEX CONCURRENTLY ??", [`public.${index}`]);
    }
    if (settings.indexed && (!existing.rows.length || !existing.rows[0].valid)) {
      await raw("CREATE INDEX CONCURRENTLY ?? ON ?? USING gin (lower(??) gin_trgm_ops)",
        [index, `public.${name}`, column]);
    }
    await raw(`
      INSERT INTO public.asmblyr_field_metadata
        (collection_name, field_name, semantic_type, required, default_value, searchable)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (collection_name, field_name)
        DO UPDATE SET searchable = EXCLUDED.searchable
    `, [name, column, current.semantic_type, current.required,
      current.default_value === null ? null : JSON.stringify(current.default_value), settings.searchable]);
  } finally {
    try { await raw("SELECT pg_advisory_unlock(hashtext(?), hashtext(?))", [name, column]); }
    finally { await database.client.releaseConnection(connection); }
  }
  return { searchable: settings.searchable, indexed: settings.indexed };
}
