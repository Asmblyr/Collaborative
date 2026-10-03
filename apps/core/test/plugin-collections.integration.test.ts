import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { parsePluginCollection } from "../src/plugins/collection-definition.js";
import type { LoadedPlugin } from "../src/plugins/definition.js";
import { installPluginCollections } from "../src/plugins/install-collections.js";

function pluginFixture() {
  const namespace = `test${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const plugin: LoadedPlugin = {
    name: `test-plugin-${namespace}`,
    namespace,
    capabilities: ["collections.manage"],
    definition: {},
    endpoints: [],
    collections: [
      parsePluginCollection(
        {
          name: "entries",
          primaryKey: { name: "id", type: "uuid" },
          timestamps: { createdAt: true, updatedAt: true },
          presentation: { displayName: "Test comments", hidden: true },
          fields: {
            body: {
              type: "text",
              required: true,
              nullable: false,
              presentation: { label: "Комментарий", interface: "textarea" },
            },
          },
        },
        namespace,
        "entries",
      ),
    ],
  };
  return { plugin, namespace, name: `plugin_${namespace}_entries` };
}

function database(t: TestContext) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  t.after(() => db.destroy());
  return db;
}

test("startup installs collection, restart preserves rows, API protects structure and enforces row grants", async (t) => {
  const db = database(t);
  const { plugin, name } = pluginFixture();
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [plugin],
  });
  t.after(() => app.close());
  await app.ready();
  const [admin, outsider] = await db("asmblyr_users")
    .insert([
      { email: `${randomUUID()}@test.invalid`, superuser: true },
      { email: `${randomUUID()}@test.invalid`, superuser: false },
    ])
    .returning<{ id: string }[]>("id");
  const headers = {
    authorization: `Bearer ${(await issueUserTokens(db, admin.id)).accessToken}`,
  };
  const outsiderHeaders = {
    authorization: `Bearer ${(await issueUserTokens(db, outsider.id)).accessToken}`,
  };
  const created = await app.inject({
    method: "POST",
    url: `/items/${name}`,
    headers,
    payload: { body: "Preserve me" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().data.id;
  assert.ok(created.json().data.created_at);
  await Promise.all([
    installPluginCollections(db, [plugin]),
    installPluginCollections(db, [plugin]),
  ]);
  const metadata = await app.inject({ url: "/collections", headers });
  const collection = metadata
    .json()
    .data.find((entry: { name: string }) => entry.name === name);
  assert.equal(collection.access.structure, false);
  assert.equal(collection.hidden, true);
  assert.equal(collection.fields[0].presentation.label, "Комментарий");
  const updated = await app.inject({
    method: "PATCH",
    url: `/items/${name}/${id}`,
    headers,
    payload: { body: "Updated" },
  });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(
    (await app.inject({ url: `/items/${name}`, headers: outsiderHeaders }))
      .statusCode,
    403,
  );
  const operations = [
    { method: "DELETE", url: `/collections/${name}` },
    {
      method: "POST",
      url: `/collections/${name}/fields`,
      payload: { name: "extra", type: "text" },
    },
    {
      method: "PATCH",
      url: `/collections/${name}/fields/body`,
      payload: { nullable: true },
    },
    { method: "DELETE", url: `/collections/${name}/fields/body` },
    {
      method: "PUT",
      url: `/collections/${name}/fields/body/presentation`,
      payload: {},
    },
    {
      method: "PUT",
      url: `/collections/${name}/fields/body/configuration`,
      payload: {},
    },
    {
      method: "PUT",
      url: `/collections/${name}/fields/body/search`,
      payload: {},
    },
    { method: "POST", url: `/collections/${name}/relations`, payload: {} },
    {
      method: "PATCH",
      url: `/collections/${name}/settings`,
      payload: { hidden: false },
    },
  ] as const;
  for (const operation of operations) {
    const response = await app.inject({ ...operation, headers });
    assert.equal(
      response.statusCode,
      403,
      `${operation.url}: ${response.body}`,
    );
  }
  for (const reserved of [
    "plugin_user_table",
    "PLUGIN_user_table",
    "asmblyr_fake",
  ]) {
    const response = await app.inject({
      method: "POST",
      url: "/collections",
      headers,
      payload: { name: reserved },
    });
    assert.equal(response.statusCode, 403, response.body);
  }
  await installPluginCollections(db, []);
  assert.equal((await db(name).first("body")).body, "Updated");
  const restarted = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [plugin],
  });
  t.after(() => restarted.close());
  const read = await restarted.inject({ url: `/items/${name}/${id}`, headers });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.json().data.body, "Updated");
  assert.equal(
    (
      await restarted.inject({
        method: "DELETE",
        url: `/items/${name}/${id}`,
        headers,
      })
    ).statusCode,
    204,
  );
});

test("concurrent first installation creates one owner and one table", async (t) => {
  const db = database(t);
  const { plugin, name } = pluginFixture();
  await Promise.all([
    installPluginCollections(db, [plugin]),
    installPluginCollections(db, [plugin]),
  ]);
  assert.equal(
    (await db("asmblyr_plugin_collections").where({ collection_name: name }))
      .length,
    1,
  );
  assert.equal(await db.schema.hasTable(name), true);
});

test("an existing table is never adopted and failed installation rolls back earlier tables and owners", async (t) => {
  const db = database(t);
  const first = pluginFixture();
  const conflict = pluginFixture();
  await db.schema.createTable(conflict.name, (table) => table.text("marker"));
  await db(conflict.name).insert({ marker: "user-owned" });
  await assert.rejects(
    installPluginCollections(db, [first.plugin, conflict.plugin]),
    /adopted/,
  );
  assert.equal(await db.schema.hasTable(first.name), false);
  assert.equal(
    await db("asmblyr_plugins").where({ namespace: first.namespace }).first(),
    undefined,
  );
  assert.equal(
    await db("asmblyr_collections").where({ name: first.name }).first(),
    undefined,
  );
  assert.equal((await db(conflict.name).first()).marker, "user-owned");
});

test("changed or removed definitions, renamed namespace and different owner fail without changing data", async (t) => {
  const db = database(t);
  const { plugin, name } = pluginFixture();
  await installPluginCollections(db, [plugin]);
  await db(name).insert({ body: "keep" });
  const changed = structuredClone(plugin);
  changed.collections![0].input.fields[0].type = "integer";
  await assert.rejects(
    installPluginCollections(db, [changed]),
    /explicit migration required/,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...plugin, collections: [] }]),
    /removed/,
  );
  await assert.rejects(
    installPluginCollections(db, [
      { ...plugin, namespace: undefined, collections: [] },
    ]),
    /explicit migration required/,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...plugin, namespace: "renamed" }]),
    /different owner/,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...plugin, name: "different-package" }]),
    /different owner/,
  );
  assert.equal((await db(name).first()).body, "keep");
  await db.schema.dropTable(name);
  await assert.rejects(installPluginCollections(db, [plugin]), /missing/);
  assert.equal(await db.schema.hasTable(name), false);
});

test("a startup collision prevents the application from accepting requests", async (t) => {
  const db = database(t);
  const { plugin, name } = pluginFixture();
  await db.schema.createTable(name, (table) => table.integer("marker"));
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
    plugins: [plugin],
  });
  t.after(() => app.close());
  await assert.rejects(app.ready(), /adopted/);
});
