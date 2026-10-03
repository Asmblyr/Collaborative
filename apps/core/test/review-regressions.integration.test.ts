import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("relation filters cannot shadow legal source names, including self relations", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  try {
    for (const name of ["related", "bridge"]) {
      const created = await app.inject({
        method: "POST",
        url: "/collections",
        payload: {
          name,
          primaryKey: { name: "id", type: "serial" },
          fields: [{ name: "name", type: "text" }],
        },
      });
      assert.equal(created.statusCode, 201, created.body);
      const relation = await app.inject({
        method: "POST",
        url: `/collections/${name}/relations`,
        payload: {
          name: "owner",
          targetCollection: name,
        },
      });
      assert.equal(relation.statusCode, 201, relation.body);
      const [parent] = await database(name).insert({ name: "Ada" }).returning("id");
      await database(name).insert({ name: "Child", owner: parent.id });
      const filter = encodeURIComponent(
        JSON.stringify([{ field: "owner.name", op: "eq", value: "Ada" }]),
      );
      const response = await app.inject(`/items/${name}?filter=${filter}`);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.length, 1);
      assert.equal(response.json().data[0].name, "Child");
    }
    const many = await app.inject({
      method: "POST",
      url: "/collections/bridge/relations",
      payload: {
        kind: "m2m",
        name: "people",
        targetCollection: "related",
        junctionCollection: "test_alias_edges",
        sourceKey: "source_id",
        targetKey: "target_id",
      },
    });
    assert.equal(many.statusCode, 201, many.body);
    const source = await database("bridge").where({ name: "Child" }).first("id");
    const target = await database("related").where({ name: "Ada" }).first("id");
    await database("test_alias_edges").insert({ source_id: source.id, target_id: target.id });
    const filter = encodeURIComponent(
      JSON.stringify([{ field: "people.name", op: "eq", value: "Ada", quantifier: "some" }]),
    );
    const response = await app.inject(`/items/bridge?filter=${filter}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.length, 1);
    assert.equal(response.json().data[0].name, "Child");
  } finally {
    await app.inject({ method: "DELETE", url: "/collections/test_alias_edges" });
    for (const name of ["related", "bridge"])
      await app.inject({ method: "DELETE", url: `/collections/${name}` });
    await app.close();
    await database.destroy();
  }
});

test("readiness requires all shipped migrations and detects collection metadata drift", async () => {
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const migration = await database("asmblyr_migrations").orderBy("id", "desc").first();
  try {
    assert.equal((await app.inject("/ready")).statusCode, 200);
    await database("asmblyr_migrations")
      .where({ id: migration.id })
      .update({ name: "not_a_shipped_migration.cjs" });
    assert.equal((await app.inject("/ready")).statusCode, 503);
    await database("asmblyr_migrations")
      .where({ id: migration.id })
      .update({ name: migration.name });
    await database.schema.alterTable("asmblyr_collections", (table) =>
      table.renameColumn("mcp_description", "test_missing_description"),
    );
    try {
      assert.equal((await app.inject("/ready")).statusCode, 503);
    } finally {
      await database.schema.alterTable("asmblyr_collections", (table) =>
        table.renameColumn("test_missing_description", "mcp_description"),
      );
    }
    assert.equal((await app.inject("/ready")).statusCode, 200);
  } finally {
    await database("asmblyr_migrations")
      .where({ id: migration.id })
      .update({ name: migration.name });
    await app.close();
    await database.destroy();
  }
});
