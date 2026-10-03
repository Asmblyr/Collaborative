import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("field defaults backfill new columns and apply only to omitted values", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_defaults_${Date.now()}`;

  try {
    const created = await app.inject({ method: "POST", url: "/collections", payload: {
      name, fields: [{ name: "optional", type: "text", nullable: true, defaultValue: "fallback" }],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const first = await app.inject({ method: "POST", url: `/items/${name}`, payload: {} });
    assert.equal(first.statusCode, 201, first.body);
    assert.equal(first.json().data.optional, "fallback");
    const firstId = first.json().data.id as string;

    const defaults = [
      { name: "label", type: "text", required: true, nullable: false, defaultValue: "O'Reilly" },
      { name: "count", type: "integer", nullable: false, defaultValue: 0 },
      { name: "enabled", type: "boolean", nullable: false, defaultValue: false },
      { name: "published_at", type: "datetime", nullable: false, defaultValue: "2026-09-27T10:45:30Z" },
      { name: "contact", type: "email", nullable: false, defaultValue: "person@example.com" },
      { name: "review_note", type: "text", required: true, nullable: true, defaultValue: "pending" },
    ];
    for (const field of defaults) {
      const added = await app.inject({ method: "POST", url: `/collections/${name}/fields`, payload: field });
      assert.equal(added.statusCode, 201, added.body);
    }

    const backfilled = await app.inject({ method: "GET", url: `/items/${name}/${firstId}` });
    assert.equal(backfilled.json().data.label, "O'Reilly");
    assert.equal(backfilled.json().data.count, 0);
    assert.equal(backfilled.json().data.enabled, false);
    assert.equal(backfilled.json().data.published_at, "2026-09-27T10:45:30.000Z");
    assert.equal(backfilled.json().data.contact, "person@example.com");
    assert.equal(backfilled.json().data.review_note, "pending");

    const columns = await database("columns").withSchema("information_schema")
      .where({ table_schema: "public", table_name: name }).whereIn("column_name", ["label", "count", "enabled"])
      .select("column_name", "column_default", "is_nullable");
    assert.equal(columns.length, 3);
    assert.ok(columns.every((column) => column.column_default && column.is_nullable === "NO"));

    const second = await app.inject({ method: "POST", url: `/items/${name}`, payload: { optional: null } });
    assert.equal(second.statusCode, 201, second.body);
    assert.equal(second.json().data.optional, null);
    assert.equal(second.json().data.label, "O'Reilly");
    const secondId = second.json().data.id as string;

    for (const payload of [{ label: null }, { label: "" }, { review_note: null }]) {
      const rejected = await app.inject({ method: "POST", url: `/items/${name}`, payload });
      assert.equal(rejected.statusCode, 400, rejected.body);
    }

    const updated = await app.inject({ method: "PATCH", url: `/collections/${name}/fields/label`,
      payload: { defaultValue: "Next" } });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.fields.find((field: { name: string }) => field.name === "label").defaultValue,
      "Next");
    const unchanged = await app.inject({ method: "GET", url: `/items/${name}/${secondId}` });
    assert.equal(unchanged.json().data.label, "O'Reilly");
    const third = await app.inject({ method: "POST", url: `/items/${name}`, payload: {} });
    assert.equal(third.statusCode, 201, third.body);
    assert.equal(third.json().data.label, "Next");

    const invalid = await app.inject({ method: "PATCH", url: `/collections/${name}/fields/count`,
      payload: { defaultValue: "wrong" } });
    assert.equal(invalid.statusCode, 400, invalid.body);
    const cannotBackfill = await app.inject({ method: "PATCH", url: `/collections/${name}/fields/optional`,
      payload: { defaultValue: "new", nullable: false } });
    assert.equal(cannotBackfill.statusCode, 409, cannotBackfill.body);
    const stillNull = await app.inject({ method: "GET", url: `/items/${name}/${secondId}` });
    assert.equal(stillNull.json().data.optional, null);
    const blankRequired = await app.inject({ method: "PATCH", url: `/collections/${name}/fields/label`,
      payload: { defaultValue: "" } });
    assert.equal(blankRequired.statusCode, 400, blankRequired.body);

    const cleared = await app.inject({ method: "PATCH", url: `/collections/${name}/fields/label`,
      payload: { defaultValue: null } });
    assert.equal(cleared.statusCode, 200, cleared.body);
    assert.equal("defaultValue" in cleared.json().data.fields.find((field: { name: string }) =>
      field.name === "label"), false);
    const missing = await app.inject({ method: "POST", url: `/items/${name}`, payload: {} });
    assert.equal(missing.statusCode, 400, missing.body);
    const stillThere = await app.inject({ method: "GET", url: `/items/${name}/${firstId}` });
    assert.equal(stillThere.json().data.label, "O'Reilly");
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});
