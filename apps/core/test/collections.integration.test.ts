import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("collections are created atomically, listed, and protected from reserved names", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_collection_${Date.now()}`;

  try {
    const ready = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(ready.statusCode, 200, ready.body);

    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "count", type: "integer" },
        ],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.name, name);

    const listed = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.deepEqual(
      listed.json().data.find((collection: { name: string }) => collection.name === name).fields,
      [
        { name: "title", type: "text", required: true, nullable: false,
          searchable: true, searchIndexed: false },
        { name: "count", type: "integer", required: false, nullable: true },
      ],
    );

    const duplicate = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name, fields: [{ name: "title", type: "text" }] },
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);

    const reserved = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name: "asmblyr_forbidden", fields: [{ name: "title", type: "text" }] },
    });
    assert.equal(reserved.statusCode, 403, reserved.body);

    const invalid = await app.inject({
      method: "POST",
      url: "/collections",
      payload: { name: `${name}_invalid`, fields: [{ name: "id", type: "text" }] },
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.equal(await database.schema.withSchema("public").hasTable(`${name}_invalid`), false);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});

test("items use the collection fields and support CRUD", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_items_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "count", type: "integer" },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);

    const missingRequired = await app.inject({
      method: "POST", url: `/items/${name}`, payload: { count: 1 },
    });
    assert.equal(missingRequired.statusCode, 400, missingRequired.body);

    const created = await app.inject({
      method: "POST", url: `/items/${name}`, payload: { title: "Первый", count: 1 },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;
    assert.match(id, /^[0-9a-f-]{36}$/);

    const listed = await app.inject({ method: "GET", url: `/items/${name}` });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal(listed.json().data.length, 1);
    assert.deepEqual(listed.json().page, { number: 1, size: 100, total: "1",
      sort: "id", direction: "asc" });

    for (const [title, count] of [["Второй", 3], ["Третий", 2]] as const) {
      assert.equal((await app.inject({ method: "POST", url: `/items/${name}`,
        payload: { title, count } })).statusCode, 201);
    }
    const sorted = await app.inject({ method: "GET",
      url: `/items/${name}?page=2&limit=1&sort=count&direction=desc` });
    assert.equal(sorted.statusCode, 200, sorted.body);
    assert.equal(sorted.json().data[0].title, "Третий");
    assert.deepEqual(sorted.json().page, { number: 2, size: 1, total: "3",
      sort: "count", direction: "desc" });
    assert.equal((await app.inject({ method: "POST", url: `/items/${name}`,
      payload: { title: "Без числа" } })).statusCode, 201);
    const nullLast = await app.inject({ method: "GET",
      url: `/items/${name}?page=4&limit=1&sort=count&direction=desc` });
    assert.equal(nullLast.statusCode, 200, nullLast.body);
    assert.equal(nullLast.json().data[0].title, "Без числа");
    for (const query of ["page=0", "limit=101", "sort=missing", "direction=sideways"]) {
      assert.equal((await app.inject({ method: "GET", url: `/items/${name}?${query}` })).statusCode, 400);
    }

    const updated = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`, payload: { count: 2 },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.count, 2);

    const fetched = await app.inject({ method: "GET", url: `/items/${name}/${id}` });
    assert.equal(fetched.json().data.title, "Первый");

    const deleted = await app.inject({ method: "DELETE", url: `/items/${name}/${id}` });
    assert.equal(deleted.statusCode, 204, deleted.body);
    const absent = await app.inject({ method: "GET", url: `/items/${name}/${id}` });
    assert.equal(absent.statusCode, 404, absent.body);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});

test("field changes protect Core tables and preserve existing items", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_fields_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST", url: "/collections",
      payload: { name, fields: [{ name: "title", type: "text", required: true }] },
    });
    assert.equal(collection.statusCode, 201, collection.body);
    const item = await app.inject({
      method: "POST", url: `/items/${name}`, payload: { title: "Existing" },
    });
    assert.equal(item.statusCode, 201, item.body);

    const added = await app.inject({
      method: "POST", url: `/collections/${name}/fields`,
      payload: { name: "published", type: "boolean" },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.deepEqual(added.json().data.fields, [
      { name: "title", type: "text", required: true, nullable: false,
        searchable: true, searchIndexed: false },
      { name: "published", type: "boolean", required: false, nullable: true },
    ]);

    const items = await app.inject({ method: "GET", url: `/items/${name}` });
    assert.equal(items.json().data[0].published, null);

    const duplicate = await app.inject({
      method: "POST", url: `/collections/${name}/fields`,
      payload: { name: "published", type: "boolean" },
    });
    assert.equal(duplicate.statusCode, 409, duplicate.body);

    const required = await app.inject({
      method: "POST", url: `/collections/${name}/fields`,
      payload: { name: "code", type: "text", required: true },
    });
    assert.equal(required.statusCode, 409, required.body);
    assert.equal(await database.schema.withSchema("public").hasColumn(name, "code"), false);

    const protectedTable = await app.inject({
      method: "POST", url: "/collections/asmblyr_collections/fields",
      payload: { name: "should_not_exist", type: "text" },
    });
    assert.equal(protectedTable.statusCode, 403, protectedTable.body);
    assert.equal(await database.schema.withSchema("public")
      .hasColumn("asmblyr_collections", "should_not_exist"), false);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});

test("datetime fields store instants and require an explicit timezone", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_datetime_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST", url: "/collections",
      payload: {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "starts_at", type: "datetime", required: true },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);

    const column = await database("columns").withSchema("information_schema")
      .where({ table_schema: "public", table_name: name, column_name: "starts_at" })
      .first("data_type");
    assert.equal(column.data_type, "timestamp with time zone");

    const listed = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(listed.json().data.find((entry: { name: string }) => entry.name === name)
      .fields[1].type, "datetime");

    for (const invalid of ["2026-09-27T15:45:30", "2026-02-30T15:45:30Z", "tomorrow"]) {
      const response = await app.inject({
        method: "POST", url: `/items/${name}`,
        payload: { title: "Invalid", starts_at: invalid },
      });
      assert.equal(response.statusCode, 400, response.body);
    }

    const created = await app.inject({
      method: "POST", url: `/items/${name}`,
      payload: { title: "Meeting", starts_at: "2026-09-27T15:45:30+05:00" },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().data.starts_at, "2026-09-27T10:45:30.000Z");
    const id = created.json().data.id as string;

    const added = await app.inject({
      method: "POST", url: `/collections/${name}/fields`,
      payload: { name: "ends_at", type: "datetime" },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.equal(added.json().data.fields[2].type, "datetime");

    const updated = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`,
      payload: { ends_at: "2026-09-27T12:00:00Z" },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.equal(updated.json().data.ends_at, "2026-09-27T12:00:00.000Z");
    assert.equal(updated.json().data.starts_at, "2026-09-27T10:45:30.000Z");
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});
