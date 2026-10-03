import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { authorizeTestApp } from "./support/authorized-app.js";

test("item history captures actual changes, deletion and collection identity", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  const testAdmin = await authorizeTestApp(app, database);
  const name = `test_events_${Date.now()}`;

  try {
    assert.equal((await app.inject({ method: "DELETE", url: "/collections/asmblyr_item_events" }))
      .statusCode, 403);
    const collection = await app.inject({ method: "POST", url: "/collections", payload: {
      name, timestamps: { updatedAt: true }, fields: [{ name: "title", type: "text" }],
    } });
    assert.equal(collection.statusCode, 201, collection.body);

    const created = await app.inject({ method: "POST", url: `/items/${name}`, payload: { title: "First" } });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id as string;
    const initialTimestamp = created.json().data.updated_at;

    const unchanged = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`, payload: { title: "First" },
    });
    assert.equal(unchanged.statusCode, 200, unchanged.body);
    assert.equal(unchanged.json().data.updated_at, initialTimestamp);

    await database.raw("SELECT pg_sleep(0.02)");
    const updated = await app.inject({
      method: "PATCH", url: `/items/${name}/${id}`, payload: { title: "Second" },
    });
    assert.equal(updated.statusCode, 200, updated.body);

    const removed = await app.inject({ method: "DELETE", url: `/items/${name}/${id}` });
    assert.equal(removed.statusCode, 204, removed.body);

    const firstPage = await app.inject({ method: "GET", url: `/item-events/${name}?item=${id}&limit=2` });
    assert.equal(firstPage.statusCode, 200, firstPage.body);
    const firstEvents = firstPage.json().data;
    assert.deepEqual(firstEvents.map((event: { action: string }) => event.action), ["delete", "update"]);
    assert.equal(firstEvents[0].before.title, "Second");
    assert.equal(firstEvents[0].after, null);
    assert.equal(firstEvents[1].before.title, "First");
    assert.equal(firstEvents[1].after.title, "Second");
    assert.deepEqual(Object.keys(firstEvents[1].before).sort(), ["title", "updated_at"]);
    assert.equal(firstEvents[1].actor_kind, "user");
    assert.equal(firstEvents[1].actor_id, testAdmin.id);
    assert.ok(firstEvents[1].request_id);

    const nextPage = await app.inject({
      method: "GET", url: `/item-events/${name}?item=${id}&limit=2&before=${firstPage.json().nextCursor}`,
    });
    assert.equal(nextPage.statusCode, 200, nextPage.body);
    assert.deepEqual(nextPage.json().data.map((event: { action: string }) => event.action), ["create"]);
    assert.equal(nextPage.json().data[0].after.title, "First");
    assert.equal(nextPage.json().nextCursor, null);

    assert.equal((await app.inject({ method: "GET", url: `/item-events/${name}?limit=0` })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: `/item-events/${name}?before=nope` })).statusCode, 400);

    const deletedCollection = await app.inject({ method: "DELETE", url: `/collections/${name}` });
    assert.equal(deletedCollection.statusCode, 204, deletedCollection.body);
    const recreated = await app.inject({ method: "POST", url: "/collections", payload: {
      name, fields: [{ name: "title", type: "text" }],
    } });
    assert.equal(recreated.statusCode, 201, recreated.body);
    const freshHistory = await app.inject({ method: "GET", url: `/item-events/${name}` });
    assert.equal(freshHistory.statusCode, 200, freshHistory.body);
    assert.deepEqual(freshHistory.json().data, []);
    const retained = await database("asmblyr_item_events").withSchema("public")
      .where({ collection_name: name });
    assert.equal(retained.length, 3);
  } finally {
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});

test("an audit write failure rolls back the item mutation", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for integration tests");
  const database = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({ databaseUrl: process.env.DATABASE_URL, logger: false });
  await authorizeTestApp(app, database);
  const name = `test_events_fail_${Date.now()}`;
  const constraint = `test_events_reject_${Date.now()}`;
  let constraintAdded = false;

  try {
    const created = await app.inject({ method: "POST", url: "/collections", payload: {
      name, fields: [{ name: "title", type: "text" }],
    } });
    assert.equal(created.statusCode, 201, created.body);
    const literal = await database.raw<{ rows: { value: string }[] }>(
      "SELECT quote_literal(?) AS value", [name],
    );
    await database.raw(`ALTER TABLE public.asmblyr_item_events ADD CONSTRAINT ?? ` +
      `CHECK (collection_name <> ${literal.rows[0].value})`, [constraint]);
    constraintAdded = true;

    const item = await app.inject({ method: "POST", url: `/items/${name}`, payload: { title: "Rolled back" } });
    assert.equal(item.statusCode, 500, item.body);
    const count = await database(name).withSchema("public").count("* as count").first();
    assert.equal(Number(count?.count), 0);
  } finally {
    if (constraintAdded) {
      await database.raw("ALTER TABLE public.asmblyr_item_events DROP CONSTRAINT ??", [constraint]);
    }
    await database.schema.withSchema("public").dropTableIfExists(name);
    await database("asmblyr_collections").withSchema("public").where({ name }).delete();
    await database("asmblyr_item_events").withSchema("public").where({ collection_name: name }).delete();
    await app.close();
    await database.destroy();
  }
});
