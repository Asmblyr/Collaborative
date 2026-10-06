import "./support/require-test-database.js";
import assert from "node:assert/strict";
import test from "node:test";
import { useAsmblyr, type PluginCapability } from "@asmblyr-collaborative/kit";
import { readBody } from "h3";
import { pluginItemsFixture } from "./support/plugin-items-fixture.js";
import { modelDataPlugin } from "./support/model-data-plugin.js";
import { PluginActions } from "../src/plugins/actions.js";
import { createActionItems } from "../src/plugins/action-items.js";
import { capabilityItems } from "../src/plugins/capabilities.js";
import { loadAccess } from "../src/permissions/access.js";

test("package capabilities narrow even a superuser; permitted data operations still require caller grants", async (t) => {
  const plugins = [
    ["none", []],
    ["read", ["items.read"]],
    ["write", ["items.write"]],
    ["profile", ["identity.profile"]],
  ] as const;
  const f = await pluginItemsFixture({
    plugins: plugins.map(([name, capabilities]) => ({
      name,
      definition: {},
      capabilities,
      endpoints: [
        {
          method: "POST",
          path: `/${name}/probe`,
          handler: async (event) => {
            const context = useAsmblyr(event);
            const input = await readBody<{
              collection: string;
              operation: string;
            }>(event);
            if (input?.operation === "read") {
              return context.items.get(input.collection, 1);
            }
            if (input?.operation === "write") {
              return context.items.update(input.collection, 1, {
                title: "Written",
              });
            }
            return {
              actor: context.actor,
              storage: Boolean(context.storage),
              settings: Boolean(context.settings),
            };
          },
        },
      ],
    })),
  });
  t.after(f.close);
  await f
    .db("asmblyr_users")
    .where({ id: f.admin.id })
    .update({ display_name: "Admin profile" });
  const none = await f.call("POST", "/none/probe", { operation: "context" });
  assert.deepEqual(none, {
    actor: { id: f.admin.id, kind: "user" },
    storage: false,
    settings: false,
  });
  assert.equal(
    (await f.call("POST", "/profile/probe", { operation: "context" })).actor
      .displayName,
    "Admin profile",
  );
  for (const operation of ["read", "write"]) {
    const result = await f.call(
      "POST",
      "/none/probe",
      { operation, collection: f.collection },
      403,
    );
    assert.equal(result.code, "PLUGIN_CAPABILITY_DENIED");
  }
  await f.call(
    "POST",
    "/read/probe",
    { operation: "write", collection: f.collection },
    403,
  );
  const read = await f.call(
    "POST",
    "/read/probe",
    { operation: "read", collection: f.collection },
    200,
    f.memberToken,
  );
  assert.equal(read.data.secret, undefined);
  await f.call(
    "POST",
    "/read/probe",
    { operation: "read", collection: f.collection },
    403,
    f.outsiderToken,
  );
  await f.call(
    "POST",
    "/write/probe",
    { operation: "write", collection: f.collection },
    403,
    f.memberToken,
  );
  assert.deepEqual(
    await f.call("POST", "/write/probe", {
      operation: "write",
      collection: f.collection,
    }),
    { data: null },
  );
});

test("model HTTP and MCP obey the same package capability boundary", async (t) => {
  const plugin = await modelDataPlugin(t);
  plugin.capabilities = [] satisfies PluginCapability[];
  const f = await pluginItemsFixture({ plugins: [plugin] });
  t.after(f.close);
  const input = {
    collection: f.collection,
    id: "1",
    field: "title",
    value: "Changed",
    operation: "update",
  };
  const http = await f.call("POST", "/example/data", input, 403);
  assert.equal(http.code, "PLUGIN_CAPABILITY_DENIED");
  const access = await loadAccess(f.db, `Bearer ${f.adminToken}`);
  const actions = new PluginActions([plugin], async (caller, scope, owner) => ({
    actor: { id: caller.principal.id, kind: caller.principal.kind },
    items: capabilityItems(owner, createActionItems(f.db, caller, scope)),
  }));
  await assert.rejects(
    actions.callTool(access, "plugin_example__data", input),
    { code: "PLUGIN_CAPABILITY_DENIED" },
  );
  assert.equal(
    (await f.db(f.collection).where({ id: 1 }).first()).title,
    "Bravo",
  );
});
