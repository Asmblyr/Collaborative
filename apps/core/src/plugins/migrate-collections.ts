import { isDeepStrictEqual } from "node:util";
import type { Knex } from "knex";
import type { LoadedPlugin } from "./definition.js";
import type { InstalledCollection } from "./collection-repository.js";
import { applyMigrationOperation } from "./migration-operations.js";
import { parseMigration } from "./migration-index.js";

interface MigrationRow {
  plugin_namespace: string;
  name: string;
  checksum: string;
}

export async function migratePluginCollections(
  transaction: Knex.Transaction,
  plugin: LoadedPlugin,
  installed: InstalledCollection[],
  fresh: Set<string>,
): Promise<void> {
  const namespace = plugin.namespace!;
  const migrations = (plugin.migrations ?? [])
    .map((migration) => {
      const parsed = parseMigration({ operations: migration.operations }, migration.name);
      if (parsed.checksum !== migration.checksum) throw new Error("Invalid migration checksum");
      return parsed;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(migrations.map((migration) => migration.name)).size !== migrations.length)
    throw new Error("Duplicate plugin migration");
  const history = await transaction<MigrationRow>("asmblyr_plugin_migrations")
    .withSchema("public")
    .where({ plugin_namespace: namespace })
    .orderBy("name")
    .select("name", "checksum");
  for (const row of history) {
    const declared = migrations.find((migration) => migration.name === row.name);
    if (!declared || declared.checksum !== row.checksum)
      throw new Error(`Applied plugin migration was changed or removed: ${namespace}/${row.name}`);
  }
  const previousNames = new Set(history.map((entry) => entry.name));
  const latest = history.at(-1)?.name;
  const working = new Map(
    installed.map((entry) => [entry.local_name, structuredClone(entry.definition)]),
  );
  for (const collection of plugin.collections ?? []) {
    if (fresh.has(collection.localName))
      working.set(collection.localName, structuredClone(collection));
  }
  for (const migration of migrations) {
    if (previousNames.has(migration.name)) continue;
    if (latest && migration.name < latest)
      throw new Error(
        `New migration must follow applied migrations: ${namespace}/${migration.name}`,
      );
    for (const operation of migration.operations) {
      const current = working.get(operation.collection);
      if (!current)
        throw new Error(`Migration may only change owned collections: ${operation.collection}`);
      await applyMigrationOperation(
        transaction,
        namespace,
        operation,
        current,
        fresh.has(operation.collection),
      );
    }
    await transaction("asmblyr_plugin_migrations")
      .withSchema("public")
      .insert({
        plugin_namespace: namespace,
        name: migration.name,
        checksum: migration.checksum,
        baseline: installed.length === 0,
      });
  }
  for (const collection of plugin.collections ?? []) {
    const migrated = working.get(collection.localName);
    if (!isDeepStrictEqual(migrated, collection))
      throw new Error(
        `Plugin collection ${collection.input.name} has changed; explicit migration required to match the declaration`,
      );
    await transaction("asmblyr_plugin_collections")
      .withSchema("public")
      .where({ plugin_namespace: namespace, local_name: collection.localName })
      .update({ definition: JSON.stringify(collection) });
  }
}
