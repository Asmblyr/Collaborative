import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex, { type Knex } from "knex";
import { loadPlugins } from "../src/plugins/load.js";
import { installPluginCollections } from "../src/plugins/install-collections.js";
import { pluginSettingsSnapshot } from "../src/plugins/settings-repository.js";

const migration = createRequire(import.meta.url)(
  "../migrations/20261005220000_collaborative_package_names.cjs",
) as { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> };

async function isolated(run: (transaction: Knex.Transaction) => Promise<void>) {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const transaction = await db.transaction();
  try {
    await run(transaction);
  } finally {
    await transaction.rollback();
    await db.destroy();
  }
}

test("package rename preserves installed data, definitions, migration checksums and settings", async () => {
  await isolated(async (transaction) => {
    const plugins = await loadPlugins(
      new URL("../../../package.json", import.meta.url),
    );
    await installPluginCollections(transaction, plugins);
    const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
    const id = randomUUID();
    await transaction("plugin_comments_entries").insert({
      id,
      collection: "rename_test",
      item: "1",
      body: "Preserve this entry",
    });
    await transaction("asmblyr_settings")
      .insert({
        key: "plugin:comments",
        value: JSON.stringify({ allowNewComments: false, maxLength: 1234 }),
      })
      .onConflict("key")
      .merge({
        value: JSON.stringify({ allowNewComments: false, maxLength: 1234 }),
      });
    const before = await pluginSettingsSnapshot(transaction, comments);
    const definitions = await transaction("asmblyr_plugin_collections")
      .where("plugin_namespace", "comments")
      .select();
    const checksums = await transaction("asmblyr_plugin_migrations")
      .where("plugin_namespace", "comments")
      .select();
    const owner = await transaction("asmblyr_plugins")
      .where("namespace", "comments")
      .first();
    await transaction("asmblyr_plugins")
      .where("namespace", "comments")
      .update({ package_name: "@asmblyr/plugin-comments" });

    await migration.up(transaction);
    await migration.up(transaction);
    await installPluginCollections(transaction, plugins);

    assert.deepEqual(
      await transaction("asmblyr_plugins")
        .where("namespace", "comments")
        .first(),
      owner,
    );
    assert.equal(
      (await transaction("plugin_comments_entries").where({ id }).first()).body,
      "Preserve this entry",
    );
    assert.deepEqual(
      await pluginSettingsSnapshot(transaction, comments),
      before,
    );
    assert.deepEqual(
      await transaction("asmblyr_plugin_collections")
        .where("plugin_namespace", "comments")
        .select(),
      definitions,
    );
    assert.deepEqual(
      await transaction("asmblyr_plugin_migrations")
        .where("plugin_namespace", "comments")
        .select(),
      checksums,
    );
    await migration.down(transaction);
    assert.equal(
      (
        await transaction("asmblyr_plugins")
          .where("namespace", "comments")
          .first()
      ).package_name,
      "@asmblyr/plugin-comments",
    );
    assert.deepEqual(
      await pluginSettingsSnapshot(transaction, comments),
      before,
    );
  });
});

test("package rename leaves unrelated owners untouched and rejects namespace conflicts atomically", async () => {
  await isolated(async (transaction) => {
    const namespace = `rename${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    await transaction("asmblyr_plugins").insert({
      namespace,
      package_name: "@asmblyr/plugin-calculator",
    });
    const before = await transaction("asmblyr_plugins")
      .orderBy("namespace")
      .select();
    await assert.rejects(
      migration.up(transaction),
      /conflicting namespace or package owner/,
    );
    assert.deepEqual(
      await transaction("asmblyr_plugins").orderBy("namespace").select(),
      before,
    );
    await transaction("asmblyr_plugins")
      .where({ namespace })
      .update({ package_name: "third-party-plugin" });
    const unrelated = await transaction("asmblyr_plugins")
      .where({ namespace })
      .first();
    await migration.up(transaction);
    assert.deepEqual(
      await transaction("asmblyr_plugins").where({ namespace }).first(),
      unrelated,
    );
  });
});

test("package rename and rollback refuse an occupied destination without changing owners", async () => {
  await isolated(async (transaction) => {
    await transaction("asmblyr_plugins")
      .insert({
        namespace: "calculator",
        package_name: "@asmblyr/plugin-calculator",
      })
      .onConflict("namespace")
      .merge({ package_name: "@asmblyr/plugin-calculator" });
    await transaction("asmblyr_plugins").insert({
      namespace: "rename_collision",
      package_name: "@asmblyr-collaborative/plugin-calculator",
    });
    const before = await transaction("asmblyr_plugins")
      .orderBy("namespace")
      .select();
    await assert.rejects(
      migration.up(transaction),
      /conflicting namespace or package owner/,
    );
    await assert.rejects(
      migration.down(transaction),
      /conflicting namespace or package owner/,
    );
    assert.deepEqual(
      await transaction("asmblyr_plugins").orderBy("namespace").select(),
      before,
    );
  });
});
