import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { PluginActions } from "../src/plugins/actions.js";
import { createActionItems } from "../src/plugins/action-items.js";
import { loadAccess } from "../src/permissions/access.js";
import { createToolSession } from "../src/tools/session.js";
import { connectInternalMcp } from "../src/mcp/internal-client.js";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";
import { modelDataPlugin } from "./support/model-data-plugin.js";

test("model handlers share caller grants over HTTP/MCP, audit the caller and enforce readOnly", async (t) => {
  const plugin = await modelDataPlugin(t);
  const fixture = await pluginItemsFixture({ plugins: [plugin] });
  t.after(fixture.close);
  const { db, call, collection, member, memberToken, adminToken, grant } =
    fixture;
  const actions = new PluginActions([plugin], async (access, scope) => ({
    actor: { id: access.principal.id, kind: access.principal.kind },
    items: createActionItems(db, access, scope),
  }));
  async function connect(token: string) {
    const reload = () => loadAccess(db, `Bearer ${token}`);
    const client = await connectInternalMcp(
      createToolSession(db, await reload(), reload),
      actions,
    );
    t.after(() => client.close());
    return client;
  }
  const mcp = await connect(memberToken);
  const adminMcp = await connect(adminToken);
  const input = {
    collection,
    id: "1",
    field: "title",
    value: "Changed",
    operation: "update",
  };
  const denied = (value: object) =>
    assert.equal((value as { code?: string }).code, "PERMISSION_DENIED");
  const http = (
    body: object,
    status = 200,
    action = "data",
    token: string | null = memberToken,
  ) => call("POST", `/example/${action}`, body, status, token);
  const invoke = (body: object, action = "data") =>
    mcp.call(`plugin_example__${action}`, body);

  const before = await db(collection).where({ id: 1 }).first();
  await http(input, 401, "data", null);
  await http(input, 403);
  denied(await invoke(input));
  assert.deepEqual(await db(collection).where({ id: 1 }).first(), before);
  assert.equal(
    mcp.definitions.find((tool) => tool.name === "plugin_example__data")
      ?.annotations?.readOnlyHint,
    false,
  );
  assert.equal(
    mcp.definitions.find((tool) => tool.name === "plugin_example__readonly")
      ?.annotations?.readOnlyHint,
    true,
  );
  assert.equal(
    mcp.definitions.some((tool) => tool.name === "plugin_example__admin"),
    false,
  );
  await http(input, 403, "admin");
  denied(await invoke(input, "admin"));

  const permission = await grant(collection, ["title"], member.id, "update");
  const viaHttp = await http(input);
  assert.doesNotMatch(viaHttp.data.output.data, /classified|secret/);
  await invoke({ ...input, value: "From MCP" });
  assert.equal(
    (await db(collection).where({ id: 1 }).first()).title,
    "From MCP",
  );
  const event = await db("asmblyr_item_events")
    .where({ collection_name: collection, action: "update" })
    .orderBy("id", "desc")
    .first();
  assert.equal(event.actor_id, member.id);
  assert.equal(event.actor_kind, "user");
  await http({ ...input, field: "secret" }, 403);
  denied(await invoke({ ...input, field: "secret" }));
  assert.equal(
    (await db(collection).where({ id: 1 }).first()).secret,
    "classified",
  );

  for (const operation of ["create", "update", "delete", "commit"]) {
    const write = { ...input, operation };
    await http(write, 403, "readonly", adminToken);
    denied(await adminMcp.call("plugin_example__readonly", write));
  }
  // Access changes apply to the next tool call even though discovery happened earlier.
  await call(
    "DELETE",
    `/permissions/${permission.permissionId}`,
    undefined,
    204,
  );
  denied(await invoke(input));

  await db("asmblyr_collections")
    .where({ name: collection })
    .update({ mcp_enabled: false });
  denied(await invoke({ ...input, operation: "get" }));
  denied(
    await adminMcp.call("plugin_example__data", { ...input, operation: "get" }),
  );
  denied(await adminMcp.call("plugin_example__data", input));
  // MCP exposure does not revoke the user's ordinary HTTP permissions.
  await http({ ...input, operation: "get" });
  await http(input, 200, "admin", adminToken);
});

test("MCP-hidden related collections stay out of filters, search, labels and writes for superusers", async (t) => {
  const plugin = await modelDataPlugin(t);
  const fixture = await pluginItemsFixture({ plugins: [plugin] });
  t.after(fixture.close);
  const { db, call, collection, adminToken } = fixture;
  const target = `${collection}_target`;
  await call(
    "POST",
    "/collections",
    {
      name: target,
      primaryKey: { name: "id", type: "serial" },
      fields: [{ name: "name", type: "text" }],
    },
    201,
  );
  await call("POST", `/items/${target}`, { name: "Private target" }, 201);
  await call("PUT", `/collections/${target}/display`, { displayField: "name" });
  await call(
    "POST",
    `/collections/${collection}/relations`,
    { name: "target_id", targetCollection: target, reverseField: "records" },
    201,
  );
  await call("PUT", `/collections/${collection}/relations/target_id/search`, {
    searchable: true,
  });
  await call("PUT", `/collections/${collection}/display`, {
    displayField: null,
  });
  await db(collection).where({ id: 1 }).update({ target_id: 1, title: null });
  await db("asmblyr_collections")
    .where({ name: target })
    .update({ mcp_enabled: false });
  const reload = () => loadAccess(db, `Bearer ${adminToken}`);
  const actions = new PluginActions([plugin], async (access, scope) => ({
    actor: { id: access.principal.id, kind: access.principal.kind },
    items: createActionItems(db, access, scope),
  }));
  const mcp = await connectInternalMcp(
    createToolSession(db, await reload(), reload),
    actions,
  );
  t.after(() => mcp.close());
  const input = {
    collection,
    id: "1",
    field: "target_id.name",
    value: "Private target",
    operation: "filter",
  };
  const denied = (value: object) =>
    assert.equal((value as { code?: string }).code, "PERMISSION_DENIED");
  denied(await mcp.call("plugin_example__data", input));
  denied(
    await mcp.call("plugin_example__data", {
      ...input,
      operation: "update",
      field: "target_id",
      value: "1",
    }),
  );
  for (const operation of ["get", "list", "search"]) {
    const result = await mcp.call("plugin_example__data", {
      ...input,
      operation,
    });
    assert.ok("output" in result, JSON.stringify(result));
    assert.doesNotMatch(JSON.stringify(result.output), /Private target/);
  }
  const direct = await call("POST", "/example/data", input);
  assert.match(direct.data.output.data, /Private target/);

  // An enabled intermediate collection must not hide a cascade into a disabled one.
  const middle = `${collection}_middle`;
  const child = `${collection}_child`;
  for (const [name, parent] of [
    [middle, collection],
    [child, middle],
  ]) {
    await call(
      "POST",
      "/collections",
      { name, primaryKey: { name: "id", type: "serial" } },
      201,
    );
    await call(
      "POST",
      `/collections/${name}/relations`,
      {
        name: "parent_id",
        targetCollection: parent,
        onDelete: "cascade",
      },
      201,
    );
    await call("POST", `/items/${name}`, { parent_id: 1 }, 201);
  }
  await db("asmblyr_collections")
    .where({ name: child })
    .update({ mcp_enabled: false });
  denied(
    await mcp.call("plugin_example__data", {
      ...input,
      collection: middle,
      operation: "delete",
    }),
  );
  denied(
    await mcp.call("plugin_example__data", { ...input, operation: "delete" }),
  );
  assert.ok(await db(collection).where({ id: 1 }).first());
  assert.ok(await db(middle).where({ id: 1 }).first());
  assert.ok(await db(child).where({ id: 1 }).first());
});
