import { validatePluginCapabilities } from "./capabilities.js";
import type { Knex } from "knex";
import { parsePluginNamespace } from "@asmblyr/kit/node";
import { createCollectionStorage } from "../collections/create-storage.js";
import { lockCollectionOrder } from "../collections/ordering.js";
import type { LoadedPlugin } from "./definition.js";
import { migratePluginCollections } from "./migrate-collections.js";
import {
  assertInstalledNamespaces,
  assertUnclaimedCollection,
  claimNamespace,
  installedCollections,
  relationExists,
  saveOwnership,
} from "./collection-repository.js";

/** Installation and upgrades are atomic across all enabled packages. */
export async function installPluginCollections(
  database: Knex,
  plugins: readonly LoadedPlugin[],
): Promise<void> {
  for (const plugin of plugins) {
    validatePluginCapabilities(plugin);
  }
  const owned = plugins.filter(
    (plugin) => plugin.namespace !== undefined || plugin.collections?.length,
  );
  if (!plugins.length) {
    return;
  }
  if (
    !(await database.schema
      .withSchema("public")
      .hasTable("asmblyr_plugin_collections"))
  ) {
    if (!owned.length) {
      return;
    }
    throw new Error(
      "Plugin storage registry is missing; run pnpm db:migrate before starting Core",
    );
  }
  await database.transaction(async (transaction) => {
    if (
      !(await transaction.schema
        .withSchema("public")
        .hasTable("asmblyr_plugin_migrations"))
    ) {
      throw new Error(
        "Plugin migration registry is missing; run pnpm db:migrate before starting Core",
      );
    }
    await transaction.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
      "asmblyr:plugin-collections",
    ]);
    await lockCollectionOrder(transaction);
    await assertInstalledNamespaces(transaction, plugins);
    const namespaces = new Set<string>();
    for (const plugin of owned) {
      const namespace = parsePluginNamespace(plugin.namespace);
      if (!namespace) {
        throw new Error(
          `Plugin ${plugin.name}: collection declarations require a namespace`,
        );
      }
      if (namespaces.has(namespace)) {
        throw new Error(`Duplicate plugin namespace: ${namespace}`);
      }
      namespaces.add(namespace);
      await claimNamespace(transaction, namespace, plugin.name);
      const declared = plugin.collections ?? [];
      const installed = await installedCollections(transaction, namespace);
      const fresh = new Set<string>();
      const names = new Set(declared.map((collection) => collection.localName));
      if (names.size !== declared.length) {
        throw new Error(
          `Plugin ${plugin.name}: duplicate collection declaration`,
        );
      }
      for (const previous of installed) {
        if (!names.has(previous.local_name)) {
          throw new Error(
            `Plugin collection ${previous.collection_name} was removed from the package; explicit migration required`,
          );
        }
      }
      for (const collection of declared) {
        const name = collection.input.name;
        if (
          name !== `plugin_${namespace}_${collection.localName}` ||
          name.length > 63
        ) {
          throw new Error(
            `Plugin collection ${name} does not belong to namespace ${namespace}`,
          );
        }
        const previous = installed.find(
          (entry) => entry.local_name === collection.localName,
        );
        if (previous) {
          if (
            previous.collection_name !== name ||
            previous.definition_version !== 1
          ) {
            throw new Error(
              `Plugin collection ${name} has changed; explicit migration required`,
            );
          }
          if (!(await relationExists(transaction, name))) {
            throw new Error(
              `Installed plugin table ${name} is missing; restore it explicitly`,
            );
          }
          continue;
        }
        await assertUnclaimedCollection(transaction, name);
        await createCollectionStorage(transaction, collection.input);
        await saveOwnership(transaction, namespace, collection);
        fresh.add(collection.localName);
      }
      await migratePluginCollections(transaction, plugin, installed, fresh);
    }
  });
}
