import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { connectInternalMcp } from "../src/mcp/internal-client.js";
import { createToolSession } from "../src/tools/session.js";
import { connectionAccess } from "../src/mcp/access.js";
import { mutationContext } from "../src/items/mutation-context.js";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import {
  resource,
  authorize,
  sdk,
  grantWrites,
} from "./support/external-mcp-client.js";

test("external MCP uses user OAuth, official SDK, live ACL and the same data/write kernel as the site", async (t) => {
  const fixture = await mcpFixture(t);
  const { app, db, names, headers } = fixture;
  await grantWrites(fixture);
  const auth = await authorize(fixture, true);
  const external = await sdk(fixture, auth.tokens.access_token);
  const lowercase = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      authorization: `bearer ${auth.tokens.access_token}`,
      accept: "application/json, text/event-stream",
    },
    payload: { jsonrpc: "2.0", id: "lowercase", method: "tools/list" },
  });
  assert.equal(lowercase.statusCode, 200);
  t.after(() => external.client.close());
  const connection = await db("asmblyr_mcp_connections")
    .where({ client_id: auth.clientId })
    .first("id");
  const scopedReload = () => connectionAccess(db, connection.id, resource);
  const internal = await connectInternalMcp(
    createToolSession(db, await scopedReload(), scopedReload),
  );
  t.after(() => internal.close());
  const listed = await external.client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    internal.definitions.map((tool) => tool.name),
  );
  assert.equal(listed.tools.length, 10);
  assert.equal(
    (
      await external.tool("read_item", {
        collection: names.posts,
        id: "1",
        fields: ["title"],
      })
    ).code,
    "SCHEMA_REQUIRED",
  );
  assert.deepEqual(
    await external.tool("describe_collection", { collection: names.posts }),
    await internal.call("describe_collection", { collection: names.posts }),
  );
  const read = await external.tool("read_item", {
    collection: names.posts,
    id: "1",
    fields: ["title"],
  });
  assert.ok(JSON.stringify(read).includes("Alpha"));
  assert.ok(!JSON.stringify(read).includes("hidden-post-value"));
  assert.equal(
    (await external.tool("describe_collection", { collection: names.people }))
      .code,
    "PERMISSION_DENIED",
  );
  const count = { collection: names.posts, q: "", filter: "", terms: null };
  assert.deepEqual(
    await external.tool("count_items", count),
    await internal.call("count_items", count),
  );
  const prepared = await external.tool("prepare_update", {
    collection: names.posts,
    id: "1",
    values: { title: "Changed" },
  });
  assert.deepEqual(prepared.expectedValues, { title: "Alpha" });
  const update = {
    collection: names.posts,
    id: "1",
    values: { title: "Changed" },
    expectedValues: prepared.expectedValues,
    operationId: randomUUID(),
  };
  assert.equal((await external.tool("update_item", update)).applied, true);
  assert.equal((await external.tool("update_item", update)).replayed, true);
  assert.equal(
    (
      await external.tool("update_item", {
        ...update,
        values: { title: "Other" },
      })
    ).code,
    "OPERATION_REUSED",
  );
  assert.equal(
    (
      await external.tool("update_item", {
        ...update,
        operationId: randomUUID(),
        values: { title: "Other" },
      })
    ).code,
    "ITEM_CHANGED",
  );
  const rowDenied = {
    collection: names.posts,
    id: "2",
    values: { title: "Forbidden" },
    expectedValues: { title: "Beta" },
    operationId: randomUUID(),
  };
  assert.equal(
    (await external.tool("update_item", rowDenied)).code,
    "PERMISSION_DENIED",
  );
  assert.equal(
    ((await internal.call("update_item", rowDenied)) as { code: string }).code,
    "PERMISSION_DENIED",
  );
  const invalidNewState = await external.tool("update_item", {
    ...update,
    operationId: randomUUID(),
    values: { title: "Beta" },
    expectedValues: { title: "Changed" },
  });
  assert.equal(invalidNewState.code, "PERMISSION_DENIED");
  assert.equal(
    (await db(names.posts).where({ id: 1 }).first("title")).title,
    "Changed",
  );
  const create = {
    collection: names.posts,
    values: { title: "Created" },
    operationId: randomUUID(),
  };
  const created = await external.tool("create_item", create);
  assert.equal(created.applied, true, JSON.stringify(created));
  assert.equal((await external.tool("create_item", create)).id, created.id);
  assert.equal(
    Number(
      (await db(names.posts)
        .where({ title: "Created" })
        .count("* as count")
        .first())!.count,
    ),
    1,
  );
  const denied = await external.tool("create_item", {
    ...create,
    values: { title: "Secret", secret: "must-not-write" },
    operationId: randomUUID(),
  });
  assert.equal(denied.code, "PERMISSION_DENIED");
  const history = await db("asmblyr_item_events").where({
    collection_name: names.posts,
    actor_id: fixture.access.principal.id,
  });
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((row) => row.action).sort(), [
    "create",
    "update",
  ]);
  const native = await app.inject({
    url: "/users/me",
    headers: { authorization: `Bearer ${auth.tokens.access_token}` },
  });
  assert.equal(native.statusCode, 401);
  const connections = await app.inject({
    url: "/users/me/mcp-connections",
    headers,
  });
  assert.equal(connections.json().data.connections.length, 1);
  await db("asmblyr_permissions")
    .where({ id: fixture.permissions.get(names.posts) })
    .update({
      row_filter: {
        logic: "and",
        children: [
          {
            field: "title",
            op: "neq",
            value: { kind: "literal", value: "Beta" },
          },
        ],
      },
    });
  assert.deepEqual(
    await external.tool("count_items", count),
    await internal.call("count_items", count),
  );
  assert.ok(
    !JSON.stringify(
      await external.tool("read_item", {
        collection: names.posts,
        id: "2",
        fields: ["title"],
      }),
    ).includes("Beta"),
  );
  await db("asmblyr_permissions")
    .where({ id: fixture.permissions.get(names.posts) })
    .update({ fields: ["author_id"] });
  assert.equal(
    (
      await external.tool("read_item", {
        collection: names.posts,
        id: "1",
        fields: ["title"],
      })
    ).code,
    "INVALID_ARGUMENTS",
  );
  await app.inject({
    method: "DELETE",
    url: `/users/me/mcp-connections/${connections.json().data.connections[0].id}`,
    headers,
  });
  await assert.rejects(() => external.client.listTools());
});

test("shared MCP writes preserve transactional hooks, rollback and a single audit event on retry", async (t) => {
  const fixture = await mcpFixture(t);
  await grantWrites(fixture);
  let fail = true;
  let calls = 0;
  const client = await connectInternalMcp(
    createToolSession(
      fixture.db,
      await fixture.reload(),
      fixture.reload,
      undefined,
      {
        mutations: (access) => ({
          ...mutationContext(access),
          onItemEvent: async () => {
            calls++;
            if (fail) {
              throw new Error("Hook rejected");
            }
          },
        }),
      },
    ),
  );
  t.after(() => client.close());
  await client.call("describe_collection", { collection: fixture.names.posts });
  const args = {
    collection: fixture.names.posts,
    values: { title: "Hook record" },
    operationId: randomUUID(),
  };
  const failed = (await client.call("create_item", args)) as { code: string };
  assert.equal(failed.code, "REQUEST_UNAVAILABLE");
  assert.equal(
    (await fixture.db(fixture.names.posts).where({ title: "Hook record" }))
      .length,
    0,
  );
  assert.equal(
    (
      await fixture
        .db("asmblyr_tool_writes")
        .where({ user_id: fixture.access.principal.id })
    ).length,
    0,
  );
  fail = false;
  assert.equal(
    ((await client.call("create_item", args)) as { applied: boolean }).applied,
    true,
  );
  assert.equal(
    ((await client.call("create_item", args)) as { replayed: boolean })
      .replayed,
    true,
  );
  assert.equal(calls, 2);
  const events = await fixture.db("asmblyr_item_events").where({
    collection_name: fixture.names.posts,
    actor_id: fixture.access.principal.id,
  });
  assert.equal(events.length, 1);
});
