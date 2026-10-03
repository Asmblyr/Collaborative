import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CollectionField } from "../../src/collections/types.js";
import { parseDecimal } from "../../src/collections/structured-values.js";

export const names = ["clients", "shops", "categories", "shop_categories", "shop_categories_clients"] as const;
export type Name = typeof names[number];
export type Row = Record<string, unknown>;
export interface SourceField {
  field: string;
  schema: null | {
    data_type: string; is_primary_key: boolean; is_nullable: boolean;
    is_unique: boolean; is_indexed: boolean; default_value: unknown;
    has_auto_increment: boolean; max_length: number | null;
  };
  meta: null | { required: boolean; searchable?: boolean };
}
export interface SourceRelation {
  collection: Name; field: string; related_collection: string;
  schema: { on_delete: string; on_update: string };
  meta: { one_field: string | null; junction_field: string | null };
}
export interface Snapshot {
  metadata: {
    exportedAt: string;
    fields: Record<Name, SourceField[]>;
    relations: Record<Name, SourceRelation[]>;
    counts: Record<Name, { count: string }[]>;
  };
  rows: Record<Name, Row[]>;
}

export function physicalFields(snapshot: Snapshot, name: Name) {
  return snapshot.metadata.fields[name].filter((f) => f.schema !== null);
}

export function internalRelations(snapshot: Snapshot) {
  return names.flatMap((n) => snapshot.metadata.relations[n])
    .filter((r) => names.includes(r.related_collection as Name));
}

export function mapField(field: SourceField): CollectionField {
  const schema = field.schema!;
  const types: Record<string, CollectionField["type"]> = {
    uuid: "uuid", integer: "integer", boolean: "boolean",
    "character varying": "text", "timestamp with time zone": "datetime",
    numeric: "decimal", json: "json",
  };
  const type = types[schema.data_type];
  assert.ok(type, `Transfer: unsupported type for ${field.field}`);
  return { name: field.field, type, nullable: schema.is_nullable,
    required: field.meta?.required === true,
    ...(schema.default_value === null ? {} : { defaultValue: schema.default_value as CollectionField["defaultValue"] }),
    ...(type === "text" ? { searchable: field.meta?.searchable !== false } : {}),
  };
}

export async function readSnapshot(directory: string): Promise<Snapshot> {
  const metadata = JSON.parse(await readFile(join(directory, "metadata.json"), "utf8"));
  const rows = {} as Snapshot["rows"];
  for (const name of names) rows[name] = JSON.parse(await readFile(join(directory, `${name}.json`), "utf8"));
  const snapshot: Snapshot = { metadata, rows };
  for (const name of names) {
    const fields = physicalFields(snapshot, name);
    assert.equal(fields.filter((f) => f.schema!.is_primary_key).length, 1, `Transfer: invalid primary key in ${name}`);
    assert.equal(fields.find((f) => f.schema!.is_primary_key)?.field, "id", `Transfer: unexpected primary key in ${name}`);
    assert.equal(rows[name].length, Number(metadata.counts[name][0].count), `Transfer: count mismatch in ${name}`);
    assert.equal(new Set(rows[name].map((r) => String(r.id))).size, rows[name].length, `Transfer: duplicate IDs in ${name}`);
    const keys = fields.map((f) => f.field).sort().join(",");
    for (const row of rows[name]) {
      assert.equal(Object.keys(row).sort().join(","), keys, `Transfer: missing or extra fields in ${name}`);
      for (const field of fields) {
        assert.ok(field.schema!.is_nullable || row[field.field] !== null, `Transfer: non-nullable value missing in ${name}.${field.field}`);
      }
    }
  }
  for (const relation of internalRelations(snapshot)) {
    const ids = new Set(rows[relation.related_collection as Name].map((r) => String(r.id)));
    assert.ok(rows[relation.collection].every((r) => r[relation.field] === null || ids.has(String(r[relation.field]))),
      `Transfer: orphan relation ${relation.collection}.${relation.field}`);
  }
  return snapshot;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  return value;
}

/** Normalize only equivalent DB representations; never round numeric values. */
export function fingerprint(rows: Row[], fields: SourceField[]) {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const normalized = sorted.map((row) => fields.map((f) => {
    const value = row[f.field];
    if (value === null) return null;
    switch (f.schema!.data_type) {
      case "timestamp with time zone": return new Date(value as string).toISOString();
      case "numeric": return parseDecimal(value);
      case "uuid": return String(value).toLowerCase();
      case "json": return canonical(value);
      default: return value;
    }
  }));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
