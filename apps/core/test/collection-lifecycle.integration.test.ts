import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("deletion previews counts, protects managed structure, and removes metadata atomically", async () => {
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
  const name = `test_lifecycle_${Date.now()}`;
  const view = `test_lifecycle_view_${Date.now()}`;

  try {
    const created = await app.inject({
      method: "POST",
      url: "/collections",
      payload: {
        name,
        timestamps: { createdAt: true },
        fields: [
          { name: "title", type: "text", required: true },
          { name: "note", type: "email" },
        ],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    for (const payload of [
      { title: "First", note: "first@example.com" },
      { title: "Second" },
    ]) {
      const inserted = await app.inject({
        method: "POST",
        url: `/items/${name}`,
        payload,
      });
      assert.equal(inserted.statusCode, 201, inserted.body);
    }

    const collectionImpact = await app.inject({
      method: "GET",
      url: `/collections/${name}/impact`,
    });
    assert.deepEqual(collectionImpact.json().data, { itemCount: "2" });
    const fieldImpact = await app.inject({
      method: "GET",
      url: `/collections/${name}/fields/note/impact`,
    });
    assert.deepEqual(fieldImpact.json().data, {
      itemCount: "2",
      populatedCount: "1",
    });

    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/collections/asmblyr_collections/impact",
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: "/collections/asmblyr_collections",
        })
      ).statusCode,
      403,
    );
    for (const method of ["GET", "DELETE"] as const) {
      assert.equal(
        (
          await app.inject({
            method,
            url: `/collections/${name}/fields/id${method === "GET" ? "/impact" : ""}`,
          })
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await app.inject({
            method,
            url: `/collections/${name}/fields/created_at${method === "GET" ? "/impact" : ""}`,
          })
        ).statusCode,
        403,
      );
    }
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/collections/${name}/fields/missing`,
        })
      ).statusCode,
      404,
    );

    await database.raw("CREATE VIEW ?? AS SELECT ?? FROM ??", [
      `public.${view}`,
      "note",
      `public.${name}`,
    ]);
    const dependentField = await app.inject({
      method: "DELETE",
      url: `/collections/${name}/fields/note`,
    });
    assert.equal(dependentField.statusCode, 409, dependentField.body);
    const dependentCollection = await app.inject({
      method: "DELETE",
      url: `/collections/${name}`,
    });
    assert.equal(dependentCollection.statusCode, 409, dependentCollection.body);
    assert.equal(
      await database.schema.withSchema("public").hasColumn(name, "note"),
      true,
    );
    await database.raw("DROP VIEW ??", [`public.${view}`]);

    const removedField = await app.inject({
      method: "DELETE",
      url: `/collections/${name}/fields/note`,
    });
    assert.equal(removedField.statusCode, 204, removedField.body);
    assert.equal(
      await database.schema.withSchema("public").hasColumn(name, "note"),
      false,
    );
    const fieldMetadata = await database("asmblyr_field_metadata")
      .withSchema("public")
      .where({ collection_name: name, field_name: "note" })
      .first();
    assert.equal(fieldMetadata, undefined);
    const afterFieldDelete = await app.inject({
      method: "GET",
      url: `/items/${name}`,
    });
    assert.equal(afterFieldDelete.json().data.length, 2);
    assert.equal(afterFieldDelete.json().data[0].note, undefined);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/collections/${name}/fields/note/impact`,
        })
      ).statusCode,
      404,
    );

    const removedCollection = await app.inject({
      method: "DELETE",
      url: `/collections/${name}`,
    });
    assert.equal(removedCollection.statusCode, 204, removedCollection.body);
    assert.equal(
      await database.schema.withSchema("public").hasTable(name),
      false,
    );
    assert.equal(
      await database("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .first(),
      undefined,
    );
    assert.equal(
      (await app.inject({ method: "GET", url: `/collections/${name}/impact` }))
        .statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ method: "DELETE", url: `/collections/${name}` }))
        .statusCode,
      404,
    );
  } finally {
    await database.raw("DROP VIEW IF EXISTS ??", [`public.${view}`]);
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
