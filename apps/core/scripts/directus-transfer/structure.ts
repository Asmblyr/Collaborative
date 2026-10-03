import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { createCollection } from "../../src/collections/service.js";
import { createForeignKey } from "../../src/collections/relations.js";
import { createAlias } from "../../src/collections/relation-aliases.js";
import { internalRelations, mapField, names, physicalFields, type Name, type Snapshot } from "./snapshot.js";

export async function createStructure(tx: Knex.Transaction, snapshot: Snapshot) {
  const relations = internalRelations(snapshot);
  for (const name of names) {
    assert.ok(!await tx.schema.withSchema("public").hasTable(name) &&
      !await tx("asmblyr_collections").where({ name }).first("id"), `Transfer: destination already exists: ${name}`);
  }
  for (const name of names) {
    const fields = physicalFields(snapshot, name);
    const pk = fields.find((f) => f.schema!.is_primary_key)!;
    const primaryKeyType = pk.schema!.data_type === "uuid" ? "uuid" : "serial";
    assert.ok(primaryKeyType === "uuid" || pk.schema!.has_auto_increment, `Transfer: unsupported primary key in ${name}`);
    const relationFields = new Set(relations.filter((r) => r.collection === name).map((r) => r.field));
    await createCollection(tx, { name, primaryKey: { name: "id", type: primaryKeyType },
      fields: fields.filter((f) => !f.schema!.is_primary_key && !relationFields.has(f.field)).map(mapField),
    });
    // Keep source uniqueness. Varchar/numeric/json use Core's supported storage types.
    for (const field of fields.filter((f) => !f.schema!.is_primary_key && !relationFields.has(f.field))) {
      if (field.schema!.is_unique || field.schema!.is_indexed) {
        await tx.schema.withSchema("public").alterTable(name, (table) => {
          if (field.schema!.is_unique) table.unique([field.field]);
          else table.index([field.field]);
        });
      }
    }
  }
  for (const relation of relations) {
    const field = physicalFields(snapshot, relation.collection).find((f) => f.field === relation.field)!;
    assert.ok(["NO ACTION", "CASCADE"].includes(relation.schema.on_delete), "Transfer: unsupported delete action");
    assert.ok(["NO ACTION", "CASCADE"].includes(relation.schema.on_update), "Transfer: unsupported update action");
    await createForeignKey(tx, relation.collection, {
      name: relation.field, targetCollection: relation.related_collection,
      required: field.meta?.required === true, nullable: field.schema!.is_nullable,
      onDelete: relation.schema.on_delete === "CASCADE" ? "cascade" : "restrict",
    });
    // Recreate this newly-created FK with the exact source actions, deferred only
    // during insertion so self-referencing category trees need no artificial order.
    const digest = createHash("sha256").update(`${relation.collection}.${relation.field}`).digest("hex").slice(0, 20);
    const constraint = `asmblyr_relation_fk_${digest}`;
    await tx.raw("ALTER TABLE ?? DROP CONSTRAINT ??", [`public.${relation.collection}`, constraint]);
    await tx.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? FOREIGN KEY (??) REFERENCES ?? (id)
      ON DELETE ${relation.schema.on_delete} ON UPDATE ${relation.schema.on_update} DEFERRABLE INITIALLY IMMEDIATE`,
    [`public.${relation.collection}`, constraint, relation.field, `public.${relation.related_collection}`]);
    if (relation.meta.one_field) {
      const peer = relation.meta.junction_field
        ? relations.find((r) => r.collection === relation.collection && r.field === relation.meta.junction_field) : undefined;
      assert.ok(!relation.meta.junction_field || peer, "Transfer: missing junction peer");
      await createAlias(tx, { collection: relation.related_collection, name: relation.meta.one_field,
        kind: peer ? "m2m" : "o2m", related: peer?.related_collection ?? relation.collection,
        through: relation.collection, throughField: relation.field,
        ...(peer ? { relatedField: peer.field } : {}),
      });
    }
  }
}

export async function insertRecords(tx: Knex.Transaction, snapshot: Snapshot) {
  await tx.raw("SET CONSTRAINTS ALL DEFERRED");
  for (const name of names) {
    const jsonFields = new Set(physicalFields(snapshot, name).filter((f) => f.schema!.data_type === "json").map((f) => f.field));
    const rows = snapshot.rows[name];
    for (let offset = 0; offset < rows.length; offset += 250) {
      const batch = rows.slice(offset, offset + 250).map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, value !== null && jsonFields.has(key) ? JSON.stringify(value) : value])));
      await tx(name).withSchema("public").insert(batch);
    }
    const pk = physicalFields(snapshot, name).find((f) => f.schema!.is_primary_key)!;
    if (pk.schema!.has_auto_increment) {
      await tx.raw("SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE(MAX(id), 1), COUNT(*) > 0) FROM ??",
        [`public.${name}`, `public.${name}`]);
    }
  }
  await tx.raw("SET CONSTRAINTS ALL IMMEDIATE");
}

export const displayFields: Partial<Record<Name, string>> = {
  clients: "name", shops: "name", categories: "name", shop_categories: "local_name",
};
