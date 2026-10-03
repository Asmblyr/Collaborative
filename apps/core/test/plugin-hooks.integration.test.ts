import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { defineHook } from "@asmblyr/kit";
import { loadPlugins } from "../src/plugins/load.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";
import type { LoadedPlugin } from "../src/plugins/definition.js";

test("hooks share the transaction and comments cleanup covers every page without touching siblings", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
  let fail = false;
  const calls: string[] = [];
  const observer: LoadedPlugin = {
    name: "hook-observer",
    definition: {},
    endpoints: [],
    capabilities: ["hooks.items", "items.read"],
    hooks: [
      {
        id: "created",
        definition: defineHook("items.create", async (event, context) => {
          calls.push(`create:${event.itemId}`);
          const result = await context.items.get(
            event.collection,
            event.itemId,
          );
          assert.ok(result.data);
          assert.equal(
            "storage" in context && context.storage !== undefined,
            false,
          );
        }),
      },
      {
        id: "updated",
        definition: defineHook("items.update", (event) => {
          calls.push(`update:${event.itemId}`);
        }),
      },
      {
        id: "deleted",
        definition: defineHook("items.delete", (event) => {
          assert.deepEqual(Object.keys(event).sort(), [
            "collection",
            "collectionId",
            "itemId",
          ]);
          calls.push(`delete:${event.itemId}`);
          if (fail) {
            throw new Error("Deliberate rollback");
          }
        }),
      },
    ],
  };
  const f = await pluginItemsFixture({ plugins: [comments, observer] });
  t.after(f.close);
  assert.deepEqual(calls, ["create:1", "create:2", "create:3"]);
  await f.call("PATCH", `/items/${f.collection}/1`, { title: "Bravo" });
  assert.equal(calls.length, 3);
  await f.call("PATCH", `/items/${f.collection}`, {
    ids: ["1", "2"],
    values: { title: "Updated" },
  });
  assert.deepEqual(calls.slice(3), ["update:1", "update:2"]);
  // Seed a large discussion in the disposable database to exercise pagination cleanup.
  await f.db("plugin_comments_entries").insert(
    Array.from({ length: 105 }, () => ({
      collection: f.collection,
      item: "1",
      body: "A comment",
      author_id: f.member.id,
      author_kind: "user",
    })),
  );
  await f.call(
    "POST",
    `/comments/${f.collection}/2`,
    { body: "Sibling" },
    201,
    f.memberToken,
  );
  fail = true;
  await f.call("DELETE", `/items/${f.collection}/1`, undefined, 500);
  assert.equal(
    (
      await f
        .db("plugin_comments_entries")
        .where({ collection: f.collection, item: "1" })
    ).length,
    105,
  );
  assert.ok(await f.db(f.collection).where({ id: 1 }).first());
  fail = false;
  await f.call("DELETE", `/items/${f.collection}/1`, undefined, 204);
  assert.equal(
    (
      await f
        .db("plugin_comments_entries")
        .where({ collection: f.collection, item: "1" })
    ).length,
    0,
  );
  assert.equal(
    (
      await f
        .db("plugin_comments_entries")
        .where({ collection: f.collection, item: "2" })
    ).length,
    1,
  );
  const event = await f
    .db("asmblyr_item_events")
    .where({ collection_name: f.collection, item_id: "1", action: "delete" })
    .first();
  const cleanup = await f.db("asmblyr_item_events").where({
    collection_name: "plugin_comments_entries",
    request_id: event.request_id,
    action: "delete",
  });
  assert.equal(cleanup.length, 105);
  assert.ok(cleanup.every((entry) => entry.actor_id === f.admin.id));
  await f.call("DELETE", `/collections/${f.collection}`, undefined, 204);
  assert.equal(
    (await f.db("plugin_comments_entries").where({ collection: f.collection }))
      .length,
    0,
  );
});

test("a concurrent comment cannot survive deletion of its target", async (t) => {
  const plugins = await loadPlugins(
    new URL("../../../package.json", import.meta.url),
  );
  const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
  const f = await pluginItemsFixture({ plugins: [comments] });
  t.after(f.close);
  const lock = await f.db.transaction();
  await lock(f.collection).where({ id: 1 }).forUpdate().first();
  const posting = f.app
    .inject({
      method: "POST",
      url: `/comments/${f.collection}/1`,
      payload: { body: "Concurrent" },
      headers: { authorization: `Bearer ${f.memberToken}` },
    })
    .then((response) => response);
  const deleting = f.app
    .inject({
      method: "DELETE",
      url: `/items/${f.collection}/1`,
      headers: { authorization: `Bearer ${f.adminToken}` },
    })
    .then((response) => response);
  await lock.commit();
  const [posted, deleted] = await Promise.all([posting, deleting]);
  assert.ok([201, 404].includes(posted.statusCode), posted.body);
  assert.equal(deleted.statusCode, 204, deleted.body);
  assert.equal(
    (
      await f
        .db("plugin_comments_entries")
        .where({ collection: f.collection, item: "1" })
    ).length,
    0,
  );
});
