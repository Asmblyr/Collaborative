import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("required API validation and PostgreSQL nullability are independent", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_rules_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          { name: "label", type: "text", required: false, nullable: false },
          { name: "note", type: "text", required: false, nullable: true },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);

    for (const payload of [{ note: "No label" }, { label: null }]) {
      const rejected = await app.inject({
        method: "POST",
        url: `/items/${name}`,
        payload,
      });
      assert.equal(rejected.statusCode, 400, rejected.body);
    }

    const first = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: { label: "First" },
    });
    assert.equal(first.statusCode, 201, first.body);
    const id = first.json().data.id as string;

    const added = await app.inject({
      method: "POST",
      url: `/collections/${name}/fields`,
      payload: {
        name: "reviewer",
        type: "email",
        required: true,
        nullable: true,
      },
    });
    assert.equal(added.statusCode, 201, added.body);
    assert.deepEqual(added.json().data.fields[2], {
      name: "reviewer",
      type: "email",
      required: true,
      nullable: true,
      searchable: true,
      searchIndexed: false,
    });

    const column = await database("columns")
      .withSchema("information_schema")
      .where({
        table_schema: "public",
        table_name: name,
        column_name: "reviewer",
      })
      .first("is_nullable");
    assert.equal(column.is_nullable, "YES");

    for (const payload of [
      { label: "Missing reviewer" },
      { label: "Null reviewer", reviewer: null },
      { label: "Invalid reviewer", reviewer: "" },
    ]) {
      const rejected = await app.inject({
        method: "POST",
        url: `/items/${name}`,
        payload,
      });
      assert.equal(rejected.statusCode, 400, rejected.body);
    }

    const existing = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
    });
    assert.equal(existing.json().data.reviewer, null);

    const unrelatedUpdate = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      payload: { note: "Reviewed later" },
    });
    assert.equal(unrelatedUpdate.statusCode, 200, unrelatedUpdate.body);
    assert.equal(unrelatedUpdate.json().data.reviewer, null);

    const nullUpdate = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      payload: { reviewer: null },
    });
    assert.equal(nullUpdate.statusCode, 400, nullUpdate.body);

    const valid = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      payload: { reviewer: "person@example.com" },
    });
    assert.equal(valid.statusCode, 200, valid.body);
    assert.equal(valid.json().data.reviewer, "person@example.com");

    const requiredText = await app.inject({
      method: "POST",
      url: `/collections/${name}/fields`,
      payload: {
        name: "summary",
        type: "text",
        required: true,
        nullable: true,
      },
    });
    assert.equal(requiredText.statusCode, 201, requiredText.body);
    const blankText = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: {
        label: "Second",
        reviewer: "other@example.com",
        summary: "   ",
      },
    });
    assert.equal(blankText.statusCode, 400, blankText.body);
    const withText = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: {
        label: "Second",
        reviewer: "other@example.com",
        summary: "Ready",
      },
    });
    assert.equal(withText.statusCode, 201, withText.body);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .delete();
    await database("asmblyr_item_events")
      .withSchema("public")
      .where({ collection_name: name })
      .delete();
    await app.close();
    await database.destroy();
  }
});

test("field settings update without losing rows or changing the field type", async () => {
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL is required for integration tests",
  );
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });
  await authorizeTestApp(app, database);
  const name = `test_settings_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          { name: "note", type: "text", nullable: true },
          { name: "contact", type: "email", nullable: true },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);
    const created = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: { contact: "person@example.com" },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;

    const unsafe = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/note`,
      payload: { nullable: false, required: true },
    });
    assert.equal(unsafe.statusCode, 409, unsafe.body);
    assert.equal(
      await database.schema.withSchema("public").hasColumn(name, "note"),
      true,
    );

    const required = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/note`,
      payload: { required: true },
    });
    assert.equal(required.statusCode, 200, required.body);
    assert.deepEqual(required.json().data.fields[0], {
      name: "note",
      type: "text",
      required: true,
      nullable: true,
      searchable: true,
      searchIndexed: false,
    });

    const changed = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      payload: { note: "Filled" },
    });
    assert.equal(changed.statusCode, 200, changed.body);

    const saved = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/note`,
      payload: { nullable: false },
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().data.fields[0], {
      name: "note",
      type: "text",
      required: true,
      nullable: false,
      searchable: true,
      searchIndexed: false,
    });
    const item = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
    });
    assert.equal(item.json().data.note, "Filled");

    const relaxed = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/note`,
      payload: { required: false, nullable: true },
    });
    assert.equal(relaxed.statusCode, 200, relaxed.body);
    assert.deepEqual(relaxed.json().data.fields[0], {
      name: "note",
      type: "text",
      required: false,
      nullable: true,
      searchable: true,
      searchIndexed: false,
    });

    const contact = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/contact`,
      payload: { required: true },
    });
    assert.equal(contact.statusCode, 200, contact.body);
    assert.deepEqual(contact.json().data.fields[1], {
      name: "contact",
      type: "email",
      required: true,
      nullable: true,
      searchable: true,
      searchIndexed: false,
    });
    const typeChange = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/contact`,
      payload: { type: "text" },
    });
    assert.equal(typeChange.statusCode, 400, typeChange.body);
    const after = await app.inject({ method: "GET", url: "/collections" });
    assert.equal(
      after.json().data.find((entry: { name: string }) => entry.name === name)
        .fields[1].type,
      "email",
    );
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .delete();
    await database("asmblyr_item_events")
      .withSchema("public")
      .where({ collection_name: name })
      .delete();
    await app.close();
    await database.destroy();
  }
});
