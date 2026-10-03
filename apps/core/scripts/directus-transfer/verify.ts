import assert from "node:assert/strict";
import type { Knex } from "knex";
import type { Collection } from "../../src/collections/types.js";
import { listCollections } from "../../src/collections/catalog-repository.js";
import { listItems } from "../../src/items/service.js";
import { fingerprint, internalRelations, mapField, names, physicalFields, type Snapshot } from "./snapshot.js";

export async function verifyTransfer(db: Knex, snapshot: Snapshot) {
  const catalog = await listCollections(db);
  const relations = internalRelations(snapshot);
  const report = [];
  for (const name of names) {
    const fields = physicalFields(snapshot, name);
    const rows = await db(name).withSchema("public").select(fields.map((f) => f.field));
    assert.equal(rows.length, snapshot.rows[name].length, `Transfer: row count mismatch in ${name}`);
    const sourceHash = fingerprint(snapshot.rows[name], fields);
    const destinationHash = fingerprint(rows, fields);
    assert.equal(destinationHash, sourceHash, `Transfer: value mismatch in ${name}`);
    const collection = catalog.find((c) => c.name === name);
    assert.ok(collection, `Transfer: missing collection metadata: ${name}`);
    for (const field of fields.filter((f) => !f.schema!.is_primary_key)) {
      const actual: Collection["fields"][number] | undefined = collection.fields.find((f) => f.name === field.field);
      const relation = relations.find((r) => r.collection === name && r.field === field.field);
      assert.equal(actual?.type, relation ? "relation" : mapField(field).type, `Transfer: invalid catalog type: ${name}.${field.field}`);
      assert.equal(actual?.required, field.meta?.required === true, `Transfer: invalid required: ${name}.${field.field}`);
      assert.equal(actual?.nullable, field.schema!.is_nullable, `Transfer: invalid nullable: ${name}.${field.field}`);
    }
    const apiList = await listItems(db, name, ["*"], { limit: "1" });
    assert.equal(apiList.page.total, String(rows.length), `Transfer: item service count mismatch: ${name}`);
    report.push({ collection: name, rows: rows.length, physicalFields: fields.length,
      aliases: collection.fields.filter((f) => f.type === "alias").map((f) => f.name), sha256: destinationHash });
  }
  for (const relation of relations) {
    const actual = catalog.find((c) => c.name === relation.collection)?.fields.find((f) => f.name === relation.field);
    assert.equal(actual?.relation?.collection, relation.related_collection, "Transfer: wrong relation target");
    if (relation.meta.one_field) {
      const reverse = catalog.find((c) => c.name === relation.related_collection)?.fields.find((f) => f.name === relation.meta.one_field);
      assert.equal(reverse?.relation?.kind, relation.meta.junction_field ? "m2m" : "o2m", "Transfer: missing inverse relation");
    }
  }
  return report;
}
