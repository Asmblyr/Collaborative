import type {
  AsmblyrContext,
  EndpointLogger,
} from "@asmblyr-collaborative/kit";
import type { Knex } from "knex";
import { requireGrant, type Access } from "../permissions/access.js";
import type { MutationFactory } from "../items/mutation-context.js";
import { lockedCollectionSchema } from "../items/schema-repository.js";
import { ItemError, parseItemId } from "../items/validation.js";
import type { LoadedPlugin } from "./definition.js";
import { capabilityItems, requireCapability } from "./capabilities.js";
import { createItemsService } from "./items.js";
import { createPluginStorage } from "./storage.js";
import { pluginSettingsValues } from "./settings-repository.js";
import { pluginActor } from "./actor.js";
import { pluginCollectionName, pluginItemId } from "./items-input.js";
import { pluginNotifications } from "../notifications/plugin-context.js";

export async function createPluginContext(
  database: Knex,
  access: Access,
  plugin: LoadedPlugin,
  runtime: { requestId: string; logger: EndpointLogger },
  mutations: MutationFactory,
): Promise<AsmblyrContext> {
  const actor = plugin.capabilities?.includes("identity.profile")
    ? await pluginActor(database, access.principal)
    : { id: access.principal.id, kind: access.principal.kind };

  return Object.freeze({
    ...runtime,
    actor: Object.freeze(actor),
    items: capabilityItems(
      plugin,
      createItemsService(database, access, mutations),
    ),
    storage: createPluginStorage(database, access, plugin, runtime.requestId),
    settings: await pluginSettingsValues(database, plugin),
    notifications: pluginNotifications(database, access, plugin),
    async withRecord<T>(
      collection: string,
      id: string | number,
      run: (context: AsmblyrContext) => Promise<T>,
    ): Promise<T> {
      requireCapability(plugin, "items.read");
      const name = pluginCollectionName(collection);
      const inputId = pluginItemId(id);
      requireGrant(access, name, "read");
      return database.transaction(async (transaction) => {
        const { settings } = await lockedCollectionSchema(transaction, name);
        const key = settings.primaryKey;
        const itemId = parseItemId(inputId, key.type);
        const row = await transaction(name)
          .withSchema("public")
          .where(key.name, itemId)
          .select(key.name)
          .forShare()
          .first();
        if (!row) {
          throw new ItemError("Item not found", 404);
        }

        // Use the ordinary reader too, including any future row authorization.
        await createItemsService(transaction, access).get(name, itemId, {
          fields: [],
        });
        const context = await createPluginContext(
          transaction,
          access,
          plugin,
          runtime,
          mutations,
        );
        return run(context);
      });
    },
  });
}
