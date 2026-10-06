import type {
  HookContext,
  HookEventName,
  HookEvents,
  EndpointLogger,
} from "@asmblyr-collaborative/kit";
import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { mutationContext } from "../items/mutation-context.js";
import type { MutationContext } from "../items/events-repository.js";
import type { LoadedPlugin } from "./definition.js";
import { createItemsService } from "./items.js";
import { createPluginStorage } from "./storage.js";
import { capabilityItems, validatePluginCapabilities } from "./capabilities.js";
import { pluginSettingsValues } from "./settings-repository.js";
import { pluginActor } from "./actor.js";
import { clearRecordNotifications } from "../notifications/repository.js";

/** Per-app registry. No global emitter or cross-request mutable context. */
export class PluginHooks {
  constructor(
    private readonly plugins: readonly LoadedPlugin[],
    private readonly logger: EndpointLogger,
  ) {
    for (const plugin of plugins) {
      validatePluginCapabilities(plugin);
    }
  }

  mutation = (access: Access): MutationContext => {
    const mutation = mutationContext(access);
    return {
      ...mutation,
      onItemEvent: (transaction, event, target) =>
        this.emit(transaction, access, mutation.requestId, event, target),
    };
  };

  async emit<E extends HookEventName>(
    transaction: Knex.Transaction,
    access: Access,
    requestId: string,
    name: E,
    target: HookEvents[E],
  ): Promise<void> {
    // Internal writes must not recursively trigger user-collection lifecycle hooks.
    if (/^(asmblyr_|plugin_)/i.test(target.collection)) {
      return;
    }
    if (name === "items.delete" && "itemId" in target) {
      await clearRecordNotifications(
        transaction,
        target.collectionId,
        String(target.itemId),
      );
    }
    for (const plugin of this.plugins) {
      const hooks = (plugin.hooks ?? []).filter(
        (entry) => entry.definition.event === name,
      );
      if (!hooks.length) {
        continue;
      }
      const service = capabilityItems(
        plugin,
        createItemsService(transaction, access),
      );
      const actor = plugin.capabilities?.includes("identity.profile")
        ? await pluginActor(transaction, access.principal)
        : { id: access.principal.id, kind: access.principal.kind };
      const context: HookContext = Object.freeze({
        actor: Object.freeze(actor),
        requestId,
        logger: this.logger,
        items: Object.freeze({ list: service.list, get: service.get }),
        storage: plugin.capabilities?.includes("storage.own")
          ? createPluginStorage(transaction, access, plugin, requestId)
          : undefined,
        settings: await pluginSettingsValues(transaction, plugin),
      });
      for (const hook of hooks) {
        try {
          // All item events share the same address; collection events omit itemId.
          await hook.definition.handle(
            Object.freeze({ ...target }) as HookEvents["items.create"],
            context,
          );
        } catch (cause) {
          throw new Error(`Plugin ${plugin.name}, hook ${hook.id} failed`, {
            cause,
          });
        }
      }
    }
  }
}
