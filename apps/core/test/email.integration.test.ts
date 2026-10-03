import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("email fields retain their semantic type and validate item writes", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_email_${Date.now()}`;

  try {
    const createdCollection = await app.inject({
      method: "POST", url: "/collections",
      payload: { name, fields: [
        { name: "note", type: "text" },
        { name: "contact", type: "email", required: true },
      ] },
    });
    assert.equal(createdCollection.statusCode, 201, createdCollection.body);

    const column = await database("columns").withSchema("information_schema")
      .where({ table_schema: "public", table_name: name, column_name: "contact" })
      .first("data_type", "is_nullable");
    assert.equal(column.data_type, "text");
    assert.equal(column.is_nullable, "NO");

    const listed = await app.inject({ method: "GET", url: "/collections" });
    const fields = listed.json().data.find((entry: { name: string }) => entry.name === name).fields;
    assert.deepEqual(fields, [
      { name: "note", type: "text", required: false, nullable: true,
        searchable: true, searchIndexed: false },
      { name: "contact", type: "email", required: true, nullable: false,
        searchable: true, searchIndexed: false },
    ]);

    for (const contact of [
      "invalid", "user @example.com", "user@example.com\n", "user@example..com",
      "a".repeat(245) + "@example.com",
    ]) {
      const invalid = await app.inject({ method: "POST", url: `/items/${name}`, payload: { contact } });
      assert.equal(invalid.statusCode, 400, invalid.body);
    }

    const created = await app.inject({
      method: "POST", url: `/items/${name}`,
      payload: { contact: "Person+tag@Example.com", note: "hello" },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.contact, "Person+tag@Example.com");
    const id = created.json().data.id as string;

    for (const [op, value, matches] of [
      ["contains", "@example", true], ["notContains", "@example", false],
      ["startsWith", "person+", true], ["notStartsWith", "person+", false],
      ["endsWith", ".COM", true], ["notEndsWith", ".COM", false],
      ["containsCase", "@Example", true], ["notContainsCase", "@example", true],
      ["startsWithCase", "Person+", true], ["notStartsWithCase", "person+", true],
      ["endsWithCase", ".com", true], ["notEndsWithCase", ".COM", true],
      ["contains", "%", false], ["contains", "_", false],
    ] as const) {
      const filter = JSON.stringify({ logic: "and", children: [{ field: "contact", op, value }] });
      const response = await app.inject({ method: "GET", url: `/items/${name}?${new URLSearchParams({ filter })}` });
      assert.equal(response.statusCode, 200, `${op} ${value}: ${response.body}`);
      assert.deepEqual(response.json().data.map((item: { id: string }) => item.id), matches ? [id] : []);
    }

    for (const value of ["", "   ", "x".repeat(256)]) {
      const filter = JSON.stringify({ logic: "and", children: [{ field: "contact", op: "contains", value }] });
      const response = await app.inject({ method: "GET", url: `/items/${name}?${new URLSearchParams({ filter })}` });
      assert.equal(response.statusCode, 400, response.body);
    }

    const rejectedUpdate = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`, payload: { contact: "bad" },
    });
    assert.equal(rejectedUpdate.statusCode, 400, rejectedUpdate.body);

    const added = await app.inject({
      method: "POST", url: `/collections/${name}/fields`,
      payload: { name: "backup", type: "email" },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.equal(added.json().data.fields[2].type, "email");

    const updated = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`,
      payload: { backup: "other@example.org" },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.backup, "other@example.org");

    const metadata = await database("asmblyr_field_metadata").withSchema("public")
      .where({ collection_name: name }).orderBy("field_name").select("field_name", "semantic_type");
    assert.deepEqual(metadata, [
      { field_name: "backup", semantic_type: "email" },
      { field_name: "contact", semantic_type: "email" },
    ]);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});
