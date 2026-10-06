import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import knex from "knex";
import type { CollectionFieldDefinition } from "@asmblyr-collaborative/kit";
import { parsePluginCollection } from "../src/plugins/collection-definition.js";
import { installPluginCollections } from "../src/plugins/install-collections.js";
import { parseMigration } from "../src/plugins/migration-index.js";
import type { LoadedPlugin } from "../src/plugins/definition.js";

function fixture(t: TestContext) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  t.after(() => db.destroy());
  const namespace = `mig${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const base = {
    name: "entries",
    primaryKey: { name: "id", type: "uuid" },
    fields: {
      body: { type: "text", nullable: false, required: true },
    },
  };
  const plugin: LoadedPlugin = {
    name: `migration-test-${namespace}`,
    namespace,
    capabilities: ["collections.manage"],
    definition: {},
    endpoints: [],
    collections: [parsePluginCollection(base, namespace, "entries")],
  };
  const field: CollectionFieldDefinition = {
    type: "text",
    nullable: true,
    required: false,
  };
  const migration = parseMigration(
    {
      operations: [
        { type: "addField", collection: "entries", name: "extra", field },
        {
          type: "addIndex",
          collection: "entries",
          name: "extra_lookup",
          fields: ["extra"],
        },
      ],
    },
    "20261002061000_extra",
  );
  const updated: LoadedPlugin = {
    ...plugin,
    collections: [
      parsePluginCollection(
        { ...base, fields: { ...base.fields, extra: field } },
        namespace,
        "entries",
      ),
    ],
    migrations: [migration],
  };
  return {
    db,
    namespace,
    name: `plugin_${namespace}_entries`,
    plugin,
    updated,
    migration,
  };
}

test("plugin upgrade preserves populated rows and concurrent startups execute migrations once", async (t) => {
  const { db, namespace, name, plugin, updated } = fixture(t);
  await installPluginCollections(db, [plugin]);
  const [row] = await db(name).insert({ body: "Keep this" }).returning("id");
  await Promise.all([
    installPluginCollections(db, [updated]),
    installPluginCollections(db, [updated]),
  ]);
  assert.deepEqual(
    await db(name).where({ id: row.id }).first("body", "extra"),
    {
      body: "Keep this",
      extra: null,
    },
  );
  const history = await db("asmblyr_plugin_migrations").where({
    plugin_namespace: namespace,
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].baseline, false);
  await installPluginCollections(db, [updated]);
  assert.equal(
    (
      await db("asmblyr_plugin_migrations").where({
        plugin_namespace: namespace,
      })
    ).length,
    1,
  );
});

test("fresh installation baselines current schema and still creates declared indexes", async (t) => {
  const { db, namespace, name, updated } = fixture(t);
  await installPluginCollections(db, [updated]);
  assert.equal(await db.schema.hasColumn(name, "extra"), true);
  assert.equal(
    (
      await db("asmblyr_plugin_migrations")
        .where({ plugin_namespace: namespace })
        .first()
    ).baseline,
    true,
  );
  const indexes = await db("pg_indexes").where({
    schemaname: "public",
    tablename: name,
  });
  assert.ok(indexes.some((entry) => entry.indexdef.includes("(extra)")));
});

test("migration failure and declaration mismatch roll back DDL, metadata and history", async (t) => {
  const { db, namespace, name, plugin, updated, migration } = fixture(t);
  await installPluginCollections(db, [plugin]);
  await db(name).insert({ body: "Keep this" });
  const invalid = parseMigration(
    {
      operations: [
        ...migration.operations,
        {
          type: "addField",
          collection: "entries",
          name: "mandatory",
          field: { type: "text", nullable: false, required: true },
        },
      ],
    },
    migration.name,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...updated, migrations: [invalid] }]),
    /null/,
  );
  assert.equal(await db.schema.hasColumn(name, "extra"), false);
  assert.equal(
    (
      await db("asmblyr_plugin_migrations").where({
        plugin_namespace: namespace,
      })
    ).length,
    0,
  );
  assert.equal((await db(name).first()).body, "Keep this");
  await assert.rejects(
    installPluginCollections(db, [{ ...plugin, migrations: [migration] }]),
    /match the declaration/,
  );
  assert.equal(await db.schema.hasColumn(name, "extra"), false);
  assert.equal(
    (
      await db("asmblyr_field_metadata").where({
        collection_name: name,
        field_name: "extra",
      })
    ).length,
    0,
  );
});

test("applied migrations cannot be edited, removed, backdated or target foreign collections", async (t) => {
  const { db, plugin, updated, migration } = fixture(t);
  await installPluginCollections(db, [plugin]);
  await installPluginCollections(db, [updated]);
  const changed = parseMigration(
    { operations: migration.operations.slice(0, 1) },
    migration.name,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...updated, migrations: [changed] }]),
    /changed or removed/,
  );
  await assert.rejects(
    installPluginCollections(db, [{ ...updated, migrations: [] }]),
    /changed or removed/,
  );
  const older = parseMigration(
    { operations: migration.operations },
    "20260101000000_older",
  );
  await assert.rejects(
    installPluginCollections(db, [
      { ...updated, migrations: [older, migration] },
    ]),
    /must follow/,
  );
  const foreign = parseMigration(
    {
      operations: [
        {
          type: "addIndex",
          collection: "asmblyr_users",
          name: "oops",
          fields: ["id"],
        },
      ],
    },
    "20261003000000_foreign",
  );
  await assert.rejects(
    installPluginCollections(db, [
      { ...updated, migrations: [migration, foreign] },
    ]),
    /only change owned/,
  );
});
