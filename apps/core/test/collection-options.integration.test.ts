import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("collections support serial, bigserial and manually entered text keys", async () => {
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
  const names: string[] = [];

  try {
    for (const type of ["serial", "bigserial", "text"] as const) {
      const name = `test_key_${type}_${Date.now()}`;
      names.push(name);
      const created = await app.inject({
        method: "POST",
        url: "/collections",
        payload: {
          name,
          primaryKey: { name: "key", type },
          fields: [],
        },
      });
      assert.equal(created.statusCode, 201, created.body);
      assert.deepEqual(created.json().data.primaryKey, { name: "key", type });

      const missing =
        type === "text"
          ? await app.inject({
              method: "POST",
              url: `/items/${name}`,
              payload: {},
            })
          : null;
      if (missing) assert.equal(missing.statusCode, 400, missing.body);

      const first = await app.inject({
        method: "POST",
        url: `/items/${name}`,
        payload: type === "text" ? { key: "first" } : {},
      });
      assert.equal(first.statusCode, 201, first.body);
      const key = String(first.json().data.key);
      assert.equal(key, type === "text" ? "first" : "1");

      const listed = await app.inject({ method: "GET", url: "/collections" });
      const entry = listed
        .json()
        .data.find((row: { name: string }) => row.name === name);
      assert.deepEqual(entry.fields, []);
      assert.deepEqual(entry.primaryKey, { name: "key", type });

      const added = await app.inject({
        method: "POST",
        url: `/collections/${name}/fields`,
        payload: { name: "note", type: "text" },
      });
      assert.equal(added.statusCode, 201, added.body);
      const changed = await app.inject({
        method: "PATCH",
        url: `/items/${name}/${key}`,
        payload: { note: "Updated" },
      });
      assert.equal(changed.statusCode, 200, changed.body);
      assert.equal(changed.json().data.note, "Updated");

      const keyChange = await app.inject({
        method: "PATCH",
        url: `/items/${name}/${key}`,
        payload: { key: "other" },
      });
      assert.equal(keyChange.statusCode, 400, keyChange.body);
      const duplicateField = await app.inject({
        method: "POST",
        url: `/collections/${name}/fields`,
        payload: { name: "key", type: "text" },
      });
      assert.equal(duplicateField.statusCode, 409, duplicateField.body);

      if (type === "text") {
        const duplicate = await app.inject({
          method: "POST",
          url: `/items/${name}`,
          payload: { key: "first" },
        });
        assert.equal(duplicate.statusCode, 409, duplicate.body);
      }
      const deleted = await app.inject({
        method: "DELETE",
        url: `/items/${name}/${key}`,
      });
      assert.equal(deleted.statusCode, 204, deleted.body);
    }
  } finally {
    for (const name of names) {
      await database.schema.withSchema("public").dropTableIfExists(name);
      await database("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .delete();
      await database("asmblyr_item_events")
        .withSchema("public")
        .where({ collection_name: name })
        .delete();
    }
    await app.close();
    await database.destroy();
  }
});

test("single-object collections reject a second item and manage timestamps", async () => {
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
  const name = `test_single_${Date.now()}`;

  try {
    const collisionName = `${name}_collision`;
    const collision = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name: collisionName,
        primaryKey: { name: "created_at", type: "uuid" },
        timestamps: { createdAt: true },
        fields: [],
      },
    });
    assert.equal(collision.statusCode, 400, collision.body);
    assert.equal(
      await database.schema.withSchema("public").hasTable(collisionName),
      false,
    );

    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        mode: "single",
        timestamps: { createdAt: true, updatedAt: true },
        fields: [],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    assert.deepEqual(created.json().data.timestamps, {
      createdAt: true,
      updatedAt: true,
    });

    const [a, b] = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: `/items/${name}`,
          payload: {},
        }),
      ),
    );
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [201, 409]);
    const item = (a.statusCode === 201 ? a : b).json().data;
    assert.ok(item.id);
    assert.ok(item.created_at);
    assert.ok(item.updated_at);

    const listed = await app.inject({ method: "GET", url: "/collections" });
    const entry = listed
      .json()
      .data.find((row: { name: string }) => row.name === name);
    assert.equal(entry.mode, "single");
    assert.deepEqual(entry.fields, []);

    for (const field of ["id", "created_at", "updated_at"]) {
      const added = await app.inject({
        method: "POST",
        url: `/collections/${name}/fields`,
        payload: { name: field, type: "text" },
      });
      assert.equal(added.statusCode, 409, added.body);
      const patched = await app.inject({
        method: "PATCH",
        url: `/items/${name}/${item.id}`,
        payload: { [field]: "changed" },
      });
      assert.equal(patched.statusCode, 400, patched.body);
    }

    await database.raw("SELECT pg_sleep(0.02)");
    const added = await app.inject({
      method: "POST",
      url: `/collections/${name}/fields`,
      payload: { name: "title", type: "text" },
    });
    assert.equal(added.statusCode, 201, added.body);
    const changed = await app.inject({
      method: "PATCH",
      url: `/items/${name}/${item.id}`,
      payload: { title: "Now configured" },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(changed.json().data.title, "Now configured");
    assert.equal(changed.json().data.created_at, item.created_at);
    assert.ok(
      new Date(changed.json().data.updated_at) > new Date(item.updated_at),
    );

    const deleted = await app.inject({
      method: "DELETE",
      url: `/items/${name}/${item.id}`,
    });
    assert.equal(deleted.statusCode, 204, deleted.body);
    const recreated = await app.inject({
      method: "POST",
      url: `/items/${name}`,
      payload: {},
    });
    assert.equal(recreated.statusCode, 201, recreated.body);
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
