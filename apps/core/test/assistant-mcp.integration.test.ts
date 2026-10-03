import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createToolSession } from "../src/tools/session.js";
import { connectInternalMcp } from "../src/mcp/internal-client.js";
import { createContextTools } from "../src/assistant/context-tools.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";

function json(value: object) {
  return JSON.parse(JSON.stringify(value));
}

test("internal MCP discovers only permitted exposed collections, checks reads and has no HTTP endpoint", async (t) => {
  const fixture = await mcpFixture(t);
  const { app, db, names, suffix, access, reload, permissions } = fixture;
  const client = await connectInternalMcp(createToolSession(db, access, reload));
  try {
    assert.deepEqual(
      client.definitions.map((tool) => tool.name),
      [
        "list_collections",
        "describe_collection",
        "search_items",
        "read_item",
        "count_items",
        "validate_filter",
        "aggregate_items",
      ],
    );
    for (const method of ["GET", "POST"] as const) {
      assert.equal((await app.inject({ method, url: "/mcp" })).statusCode, 404);
    }
    const query = { q: suffix, page: 1, limit: 1 };
    const first = json(await client.call("list_collections", query));
    assert.equal(first.hasMore, true);
    const second = json(await client.call("list_collections", { ...query, page: 2 }));
    assert.equal(second.hasMore, false);
    const listed = [...first.collections, ...second.collections];
    assert.deepEqual(
      listed.map((collection) => collection.name).sort(),
      [names.posts, names.people].sort(),
    );
    assert.equal(
      listed.find((collection) => collection.name === names.people).displayName,
      "Directory",
    );
    assert.ok(!/secret|asmblyr_|hidden-post-value/.test(JSON.stringify(listed)));
    assert.equal(
      json(await client.call("list_collections", { ...query, q: "%" })).collections.length,
      0,
    );

    const read = { collection: names.posts, id: "1", fields: ["title", "author_id"] };
    assert.ok("error" in (await client.call("read_item", read)));
    const schema = json(await client.call("describe_collection", { collection: names.posts }));
    assert.deepEqual(schema.fields.find((field) => field.name === "author_id").relation, {
      kind: "m2o",
      collection: names.people,
      displayName: "Directory",
      primaryKey: { name: "code", type: "text" },
    });
    assert.ok(!JSON.stringify(schema).includes("secret"));
    const row = json(await client.call("read_item", read));
    assert.equal(row.item.values.title, "Alpha");
    assert.equal(row.item.values.author_id, "author-a");
    await client.call("describe_collection", { collection: names.people });
    assert.equal(
      json(
        await client.call("read_item", {
          collection: names.people,
          id: row.item.values.author_id,
          fields: ["title"],
        }),
      ).item.values.title,
      "Ada",
    );

    for (const args of [
      { ...read, fields: ["secret"] },
      { ...read, collection: names.denied },
      { ...read, collection: names.disabled },
      { ...read, collection: "asmblyr_users" },
      { ...read, principal: { superuser: true } },
      { ...read, userId: randomUUID() },
    ])
      assert.ok("error" in (await client.call("read_item", args)));
    assert.ok("error" in (await client.call("delete_item", read)));
    assert.ok("error" in (await client.call("list_collections", { ...query, limit: 21 })));
    assert.ok("error" in (await client.call("describe_collection", { collection: names.denied })));

    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.posts) })
      .update({ fields: ["id"] });
    assert.ok("error" in (await client.call("read_item", read)));
    await db("asmblyr_permissions")
      .where({ id: permissions.get(names.people) })
      .delete();
    const afterRevoke = json(await client.call("list_collections", { ...query, limit: 20 }));
    assert.deepEqual(
      afterRevoke.collections.map((collection) => collection.name),
      [names.posts],
    );
    assert.ok(
      "error" in
        (await client.call("read_item", {
          collection: names.people,
          id: "author-a",
          fields: ["title"],
        })),
    );
    await db("asmblyr_collections").where({ name: names.posts }).update({ mcp_enabled: false });
    assert.ok(
      "error" in
        (await client.call("count_items", { collection: names.posts, q: null, filter: null })),
    );
    assert.equal(
      json(await client.call("list_collections", { ...query, limit: 20 })).collections.length,
      0,
    );
  } finally {
    await client.close();
  }
});

test("assistant inherits only the current table query; another collection uses its own key and scope", async (t) => {
  const { db, names, access, reload } = await mcpFixture(t);
  const tools = (await createContextTools(
    db,
    access,
    {
      page: "items",
      workspaceId: null,
      collection: names.posts,
      table: {
        page: 1,
        size: 25,
        sort: "id",
        direction: "desc",
        q: "Alpha",
        filter: "",
        selectedCount: 0,
        editorOpen: false,
      },
    },
    reload,
  ))!;
  try {
    await tools.execute("describe_collection", { collection: null });
    await tools.execute("describe_collection", { collection: names.people });
    assert.equal(
      json(await tools.execute("count_items", { collection: null, q: null, filter: null })).count,
      "1",
    );
    assert.equal(
      json(await tools.execute("count_items", { collection: names.people, q: null, filter: null }))
        .count,
      "1",
    );
    const people = json(
      await tools.execute("search_items", {
        collection: names.people,
        q: null,
        filter: null,
        fields: ["title"],
        page: 1,
        limit: 5,
        sort: null,
        direction: null,
      }),
    );
    assert.equal(people.sort, "code");
    assert.equal(people.direction, "asc");
    assert.equal(people.items[0].values.title, "Ada");
    const filter = JSON.stringify({
      logic: "and",
      children: [{ field: "title", op: "eq", value: "Ada" }],
    });
    assert.ok(
      "filter" in (await tools.execute("validate_filter", { collection: names.people, filter })),
    );
    assert.equal(tools.proposals.length, 0);
    assert.ok(
      "error" in (await tools.execute("propose_filter", { collection: names.people, filter })),
    );
    const cancelled = new AbortController();
    cancelled.abort();
    assert.ok(
      "error" in
        (await tools.execute("list_collections", { q: null, page: 1, limit: 5 }, cancelled.signal)),
    );
  } finally {
    await tools.close?.();
  }
});

test("MCP binds identity on the server and rejects a revoked session during the same turn", async (t) => {
  const { db, access, reload, suffix } = await mcpFixture(t);
  let current = access;
  const swapped = await connectInternalMcp(createToolSession(db, access, async () => current));
  try {
    current = { ...access, principal: { ...access.principal, id: randomUUID(), superuser: true } };
    assert.ok(
      "error" in (await swapped.call("list_collections", { q: suffix, page: 1, limit: 20 })),
    );
  } finally {
    await swapped.close();
  }
  const client = await connectInternalMcp(createToolSession(db, access, reload));
  try {
    await db("asmblyr_auth_sessions")
      .where({ user_id: access.principal.id })
      .update({ revoked_at: db.fn.now() });
    assert.ok(
      "error" in (await client.call("list_collections", { q: suffix, page: 1, limit: 20 })),
    );
  } finally {
    await client.close();
  }
  assert.ok("error" in (await client.call("list_collections", { q: suffix, page: 1, limit: 20 })));
});
