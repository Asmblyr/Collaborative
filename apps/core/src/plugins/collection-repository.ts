import type { Knex } from "knex";
import type { PluginCollection } from "./collection-definition.js";

export interface InstalledCollection {
  collection_name: string;
  local_name: string;
  definition_version: number;
  definition: PluginCollection;
}

export async function assertInstalledNamespaces(
  transaction: Knex.Transaction,
  plugins: readonly { name: string; namespace?: string }[],
): Promise<void> {
  const owners = await transaction("asmblyr_plugins")
    .withSchema("public")
    .whereIn(
      "package_name",
      plugins.map((plugin) => plugin.name),
    )
    .select<{ namespace: string; package_name: string }[]>(
      "namespace",
      "package_name",
    );
  for (const owner of owners) {
    const plugin = plugins.find((entry) => entry.name === owner.package_name);
    if (plugin?.namespace !== owner.namespace) {
      throw new Error(
        `Plugin ${owner.package_name} has a different owner namespace; explicit migration required`,
      );
    }
  }
}

export async function claimNamespace(
  transaction: Knex.Transaction,
  namespace: string,
  packageName: string,
): Promise<void> {
  const owners = await transaction("asmblyr_plugins")
    .withSchema("public")
    .where({ namespace })
    .orWhere({ package_name: packageName })
    .select<
      { namespace: string; package_name: string }[]
    >("namespace", "package_name");
  if (owners.length) {
    if (
      owners.length !== 1 ||
      owners[0].namespace !== namespace ||
      owners[0].package_name !== packageName
    ) {
      throw new Error(
        `Plugin namespace ${namespace} or package ${packageName} already has a different owner; explicit migration required`,
      );
    }
    return;
  }
  await transaction("asmblyr_plugins")
    .withSchema("public")
    .insert({ namespace, package_name: packageName });
}

export async function installedCollections(
  transaction: Knex.Transaction,
  namespace: string,
): Promise<InstalledCollection[]> {
  return transaction<InstalledCollection>("asmblyr_plugin_collections")
    .withSchema("public")
    .where("plugin_namespace", namespace)
    .select(
      "collection_name",
      "local_name",
      "definition",
      "definition_version",
    );
}

/** Includes views, indexes and sequences: none may be silently adopted as plugin storage. */
export async function relationExists(
  transaction: Knex.Transaction,
  name: string,
): Promise<boolean> {
  const result = await transaction.raw<{ rows: { exists: boolean }[] }>(
    "SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ?) AS exists",
    [name],
  );
  return result.rows[0].exists;
}

export async function assertUnclaimedCollection(
  transaction: Knex.Transaction,
  name: string,
): Promise<void> {
  const metadata = await transaction("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .first("name");
  if (metadata || (await relationExists(transaction, name))) {
    throw new Error(
      `Cannot install plugin collection ${name}: an existing database object or collection would be adopted`,
    );
  }
}

export async function saveOwnership(
  transaction: Knex.Transaction,
  namespace: string,
  collection: PluginCollection,
): Promise<void> {
  await transaction("asmblyr_plugin_collections")
    .withSchema("public")
    .insert({
      collection_name: collection.input.name,
      plugin_namespace: namespace,
      local_name: collection.localName,
      definition_version: 1,
      definition: JSON.stringify(collection),
    });
  for (const [field, presentation] of Object.entries(collection.presentation)) {
    await transaction("asmblyr_field_metadata")
      .withSchema("public")
      .insert({
        collection_name: collection.input.name,
        field_name: field,
        presentation: JSON.stringify(presentation),
      })
      .onConflict(["collection_name", "field_name"])
      .merge({ presentation: JSON.stringify(presentation) });
  }
}
