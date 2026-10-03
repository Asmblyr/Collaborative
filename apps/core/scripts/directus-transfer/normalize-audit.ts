import assert from "node:assert/strict";
import type { Knex } from "knex";
import { listCollections } from "../../src/collections/catalog-repository.js";
import { collectionSchema } from "../../src/items/schema-repository.js";
import { parseItem } from "../../src/items/validation.js";
import {
  fingerprint,
  names,
  physicalFields,
  type Snapshot,
} from "./snapshot.js";
import { verifyTransfer } from "./verify.js";

const affected = ["clients", "shops", "categories", "shop_categories"] as const;
const dateNames: Record<string, string> = {
  date_created: "created_at",
  date_updated: "updated_at",
};

export async function normalizationAuthor(db: Knex, authorEmail: string) {
  const users = await db("asmblyr_users")
    .withSchema("public")
    .whereRaw("lower(email) = ?", [authorEmail])
    .where({ status: "active" })
    .select("id")
    .forShare();
  assert.equal(
    users.length,
    1,
    "Transfer: expected one active normalization author",
  );
  return String(users[0].id);
}

export async function normalizeAudit(
  tx: Knex.Transaction,
  snapshot: Snapshot,
  authorId: string,
) {
  // This is a scoped post-import operation, not a general rename API. Stop if
  // someone has already customized these collections or changed their records.
  for (const name of [...affected].sort()) {
    await tx.raw("LOCK TABLE ?? IN ACCESS EXCLUSIVE MODE", [`public.${name}`]);
  }
  const collections = await tx("asmblyr_collections")
    .withSchema("public")
    .whereIn("name", affected)
    .select("id", "created_at_enabled", "updated_at_enabled", "form_layout")
    .forUpdate();
  assert.equal(
    collections.length,
    affected.length,
    "Transfer: missing target collection",
  );
  assert.ok(
    collections.every(
      (c) =>
        !c.created_at_enabled &&
        !c.updated_at_enabled &&
        c.form_layout === null,
    ),
    "Transfer: audit normalization already applied or form customized",
  );
  for (const table of [
    "asmblyr_permissions",
    "asmblyr_table_preferences",
    "asmblyr_table_views",
    "asmblyr_filter_presets",
  ]) {
    assert.ok(
      !(await tx(table)
        .withSchema("public")
        .whereIn(
          "collection_id",
          collections.map((c) => c.id),
        )
        .first()),
      `Transfer: review existing references in ${table} before renaming fields`,
    );
  }
  assert.ok(
    !(await tx("asmblyr_field_metadata")
      .withSchema("public")
      .whereIn("collection_name", affected)
      .whereIn("field_name", [
        "date_created",
        "date_updated",
        "created_at",
        "updated_at",
      ])
      .first()),
    "Transfer: review custom timestamp metadata before renaming fields",
  );
  assert.ok(
    !(await tx("asmblyr_item_events")
      .withSchema("public")
      .whereIn("collection_name", affected)
      .first()),
    "Transfer: records already have local history; review before normalization",
  );
  await verifyTransfer(tx, snapshot);
  for (const name of affected) {
    for (const target of Object.values(dateNames)) {
      assert.ok(
        !(await tx.schema.withSchema("public").hasColumn(name, target)),
        `Transfer: field already exists: ${name}.${target}`,
      );
    }
    for (const [source, target] of Object.entries(dateNames)) {
      await tx.schema
        .withSchema("public")
        .alterTable(name, (table) => table.renameColumn(source, target));
      // SET DEFAULT affects future inserts only. Existing dates, including NULL,
      // remain untouched. API writes cannot supply managed timestamp fields.
      await tx.raw(
        "ALTER TABLE ?? ALTER COLUMN ?? SET DEFAULT CURRENT_TIMESTAMP",
        [`public.${name}`, target],
      );
    }
    await tx("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .update({ created_at_enabled: true, updated_at_enabled: true });
    await tx(name).withSchema("public").update({ user_created: authorId });
  }
}

export async function verifyNormalizedAudit(
  db: Knex,
  snapshot: Snapshot,
  authorId: string,
) {
  const catalog = await listCollections(db);
  const report = [];
  for (const name of names) {
    const changed = affected.some((n) => n === name);
    const fields = physicalFields(snapshot, name).map((f) => ({
      ...f,
      field: changed ? (dateNames[f.field] ?? f.field) : f.field,
    }));
    const expected = snapshot.rows[name].map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          changed ? (dateNames[key] ?? key) : key,
          changed && key === "user_created" ? authorId : value,
        ]),
      ),
    );
    const actual = await db(name).withSchema("public").select("*");
    assert.equal(
      actual.length,
      expected.length,
      `Transfer: row count changed: ${name}`,
    );
    assert.ok(
      actual.every(
        (row) =>
          Object.keys(row).sort().join(",") ===
          fields
            .map((f) => f.field)
            .sort()
            .join(","),
      ),
      `Transfer: column set changed unexpectedly: ${name}`,
    );
    const hash = fingerprint(actual, fields);
    assert.equal(
      hash,
      fingerprint(expected, fields),
      `Transfer: normalized values mismatch: ${name}`,
    );
    if (changed) {
      const collection = catalog.find((c) => c.name === name)!;
      assert.ok(
        collection.timestamps.createdAt && collection.timestamps.updatedAt,
        `Transfer: timestamps not managed: ${name}`,
      );
      assert.ok(
        collection.fields.every(
          (f) =>
            ![
              "date_created",
              "date_updated",
              "created_at",
              "updated_at",
            ].includes(f.name),
        ),
        `Transfer: timestamp remains editable in catalog: ${name}`,
      );
      const schema = await collectionSchema(db, name);
      for (const field of [
        "created_at",
        "updated_at",
        "date_created",
        "date_updated",
      ]) {
        assert.throws(
          () =>
            parseItem(
              { [field]: "2026-01-01T00:00:00Z" },
              schema.fields,
              false,
            ),
          `Transfer: timestamp accepts explicit API values: ${name}`,
        );
      }
      const columns = await db("information_schema.columns")
        .where({ table_schema: "public", table_name: name })
        .whereIn("column_name", ["created_at", "updated_at"])
        .select("is_nullable", "column_default", "data_type");
      assert.equal(columns.length, 2);
      assert.ok(
        columns.every(
          (c) =>
            c.is_nullable === "YES" &&
            c.column_default === "CURRENT_TIMESTAMP" &&
            c.data_type === "timestamp with time zone",
        ),
        `Transfer: timestamp defaults or nullability incorrect: ${name}`,
      );
    }
    report.push({
      collection: name,
      rows: actual.length,
      normalized: changed,
      sha256: hash,
      ...(changed
        ? {
            unknownCreated: actual.filter((r) => r.created_at === null).length,
            unknownUpdated: actual.filter((r) => r.updated_at === null).length,
          }
        : {}),
    });
  }
  return report;
}
