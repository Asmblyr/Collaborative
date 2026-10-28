import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mcpFixture } from "./support/assistant-mcp-fixture.js";
import { authorize, grantWrites, sdk } from "./support/external-mcp-client.js";
import { modelDataPlugin } from "./support/model-data-plugin.js";

test("MCP inherits the live account catalog without selection or a 100-collection consent limit", async (t) => {
  let cleanup = async () => {};
  t.after(() => cleanup());
  const fixture = await mcpFixture(t);
  const { db, names, access, app, headers } = fixture;
  const auth = await authorize(fixture);
  const external = await sdk(fixture, auth.tokens.access_token);
  t.after(() => external.client.close());
  const connection = await db("asmblyr_mcp_connections")
    .where({ client_id: auth.clientId })
    .first();
  const original = await db("asmblyr_collections")
    .where({ name: names.posts })
    .first();
  // Historical selections remain stored, but no longer restrict account access.
  await db("asmblyr_mcp_connections")
    .where({ id: connection.id })
    .update({ collection_ids: JSON.stringify([original.id]) });
  assert.ok(
    !(await external.tool("describe_collection", { collection: names.people }))
      .code,
  );
  for (const collection of [names.denied, names.disabled]) {
    assert.equal(
      (await external.tool("describe_collection", { collection })).code,
      "PERMISSION_DENIED",
    );
  }
  // Only catalog metadata is needed for discovery; avoid creating 105 unused SQL tables.
  const catalog = Array.from({ length: 105 }, (_, index) => ({
    ...original,
    id: randomUUID(),
    name: `test_catalog_${fixture.suffix}_${String(index).padStart(3, "0")}`,
  }));
  const permission = await db("asmblyr_permissions")
    .where({ id: fixture.permissions.get(names.people) })
    .first();
  const assignment = await db("asmblyr_user_policies")
    .where({ user_id: access.principal.id })
    .first();
  const rules = catalog.map((collection) => ({
    ...permission,
    id: randomUUID(),
    collection_id: collection.id,
  }));
  cleanup = async () => {
    await db("asmblyr_permissions")
      .whereIn(
        "id",
        rules.map((row) => row.id),
      )
      .delete();
    await db("asmblyr_collections")
      .whereIn(
        "id",
        catalog.map((row) => row.id),
      )
      .delete();
  };
  await db("asmblyr_collections").insert(catalog);
  await db("asmblyr_permissions").insert(rules);
  await db("asmblyr_policy_permissions").insert(
    rules.map((rule) => ({
      policy_id: assignment.policy_id,
      permission_id: rule.id,
    })),
  );
  const found: string[] = [];
  for (let page = 1; page <= 6; page++) {
    const result = await external.tool("list_collections", {
      q: `test_catalog_${fixture.suffix}`,
      page,
      limit: 20,
    });
    found.push(
      ...(result.collections as { name: string }[]).map((row) => row.name),
    );
    assert.equal(result.hasMore, page < 6);
  }
  assert.deepEqual(
    found,
    catalog.map((row) => row.name),
  );
  // Account grants added/revoked after consent affect the same token immediately.
  const newlyReadable = await db("asmblyr_collections")
    .where({ name: names.denied })
    .first("id");
  await db("asmblyr_permissions")
    .where({ id: permission.id })
    .update({ collection_id: newlyReadable.id });
  assert.equal(
    (await external.tool("describe_collection", { collection: names.people }))
      .code,
    "PERMISSION_DENIED",
  );
  assert.ok(
    !(await external.tool("describe_collection", { collection: names.denied }))
      .code,
  );
  const connections = await app.inject({
    url: "/users/me/mcp-connections",
    headers,
  });
  assert.equal(connections.statusCode, 200);
  assert.ok(
    !Object.hasOwn(connections.json().data.connections[0], "collections"),
  );
});

test("external MCP shares installed model handlers, account gates and read/write enforcement even for superusers", async (t) => {
  const plugin = await modelDataPlugin(t);
  const fixture = await mcpFixture(t, undefined, [plugin]);
  const { db, names, access, app, headers } = fixture;
  await grantWrites(fixture);
  const readAuth = await authorize(fixture);
  const writeAuth = await authorize(fixture, true);
  const read = await sdk(fixture, readAuth.tokens.access_token);
  const write = await sdk(fixture, writeAuth.tokens.access_token);
  t.after(async () => {
    await read.client.close();
    await write.client.close();
  });
  const input = {
    collection: names.posts,
    id: "1",
    field: "title",
    value: "Via extension",
    operation: "get",
  };
  const toolNames = async (client: typeof read) =>
    (await client.client.listTools()).tools.map((tool) => tool.name);
  assert.ok((await toolNames(read)).includes("plugin_example__readonly"));
  assert.ok(!(await toolNames(read)).includes("plugin_example__data"));
  assert.ok((await toolNames(write)).includes("plugin_example__data"));
  assert.ok(!(await toolNames(write)).includes("plugin_example__admin"));
  const direct = await app.inject({
    method: "POST",
    url: "/example/readonly",
    headers,
    payload: input,
  });
  assert.equal(direct.statusCode, 200, direct.body);
  assert.deepEqual(
    (await read.tool("plugin_example__readonly", input)).output,
    direct.json().data.output,
  );
  const denied = async (
    client: typeof read,
    name: string,
    args: typeof input,
  ) => {
    assert.equal((await client.tool(name, args)).code, "PERMISSION_DENIED");
  };
  await denied(read, "plugin_example__data", input);
  await denied(write, "plugin_example__admin", input);
  await denied(read, "plugin_example__readonly", {
    ...input,
    operation: "update",
  });
  await write.tool("plugin_example__data", { ...input, operation: "update" });
  assert.equal(
    (await db(names.posts).where({ id: 1 }).first()).title,
    input.value,
  );
  await denied(write, "plugin_example__data", {
    ...input,
    field: "secret",
    operation: "update",
  });
  await db("asmblyr_users")
    .where({ id: access.principal.id })
    .update({ superuser: true });
  assert.ok((await toolNames(write)).includes("plugin_example__admin"));
  assert.ok(!(await toolNames(read)).includes("create_item"));
  assert.ok(!(await toolNames(read)).includes("plugin_example__admin"));
  for (const operation of ["create", "update", "delete", "commit"]) {
    await denied(read, "plugin_example__readonly", { ...input, operation });
    await denied(read, "plugin_example__data", { ...input, operation });
  }
  const forged = await read.tool("create_item", {
    collection: names.posts,
    values: { title: "Forbidden" },
    operationId: randomUUID(),
  });
  assert.ok(forged.code);
  const event = await db("asmblyr_item_events").where({
    collection_name: names.posts,
    actor_id: access.principal.id,
  });
  assert.equal(event.length, 1);
  await db("asmblyr_collections")
    .where({ name: names.posts })
    .update({ mcp_enabled: false });
  await denied(write, "plugin_example__admin", {
    ...input,
    operation: "update",
  });
  await denied(read, "plugin_example__readonly", input);
});
