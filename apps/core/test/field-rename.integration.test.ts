import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("field names are immutable while other field settings remain editable", async () => {
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
  const name = `test_field_name_${Date.now()}`;

  try {
    const collection = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        fields: [
          { name: "title", type: "text", required: true },
          { name: "contact", type: "email" },
        ],
      },
    });
    assert.equal(collection.statusCode, 201, collection.body);

    const created = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: { title: "Original", contact: "person@example.com" },
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;

    const metadataBefore = await database("asmblyr_field_metadata")
      .withSchema("public")
      .where({ collection_name: name })
      .orderBy("field_name")
      .select();

    for (const payload of [
      { name: "headline" },
      { name: "title" },
      { name: "contact" },
      { name: "headline", required: false },
    ]) {
      const rejected = await app.inject({
        method: "PATCH",
        url: `/collections/${name}/fields/title`,
        payload,
      });
      assert.equal(rejected.statusCode, 400, rejected.body);
      assert.match(rejected.json().message, /Field name cannot be changed/);
    }

    const protectedTable = await app.inject({
      method: "PATCH",
      url: "/collections/asmblyr_collections/fields/name",
      payload: { required: false },
    });
    assert.equal(protectedTable.statusCode, 403, protectedTable.body);

    const managedField = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/id`,
      payload: { required: false },
    });
    assert.equal(managedField.statusCode, 400, managedField.body);

    const missingField = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/missing`,
      payload: { required: false },
    });
    assert.equal(missingField.statusCode, 404, missingField.body);

    assert.equal(
      await database.schema.withSchema("public").hasColumn(name, "title"),
      true,
    );
    assert.equal(
      await database.schema.withSchema("public").hasColumn(name, "headline"),
      false,
    );
    const metadataAfter = await database("asmblyr_field_metadata")
      .withSchema("public")
      .where({ collection_name: name })
      .orderBy("field_name")
      .select();
    assert.deepEqual(metadataAfter, metadataBefore);

    const item = await app.inject({
      method: "GET",
      url: `/items/${name}/${id}`,
    });
    assert.equal(item.statusCode, 200, item.body);
    assert.equal(item.json().data.title, "Original");
    assert.equal(item.json().data.contact, "person@example.com");

    const updated = await app.inject({
      method: "PATCH",
      url: `/collections/${name}/fields/title`,
      payload: { required: false, nullable: true, defaultValue: "Untitled" },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    assert.deepEqual(updated.json().data.fields[0], {
      name: "title",
      type: "text",
      required: false,
      nullable: true,
      defaultValue: "Untitled",
      searchable: true,
      searchIndexed: false,
      searchPriority: null,
    });

    const newItem = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: {},
    });
    assert.equal(newItem.statusCode, 201, newItem.body);
    assert.equal(newItem.json().data.title, "Untitled");

    const invalidEmail = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${id}`,
      payload: { contact: "bad" },
    });
    assert.equal(invalidEmail.statusCode, 400, invalidEmail.body);
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
