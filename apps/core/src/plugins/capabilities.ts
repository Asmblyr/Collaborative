import {
  EndpointError,
  parseCapabilities,
  type ItemsService,
  type PluginCapability,
} from "@asmblyr/kit";
import type { LoadedPlugin } from "./definition.js";
import { isRecord } from "./definition.js";

export function approvedCapabilities(
  project: unknown,
  manifest: unknown,
  name: string,
): PluginCapability[] {
  const config =
    isRecord(project) && isRecord(project.asmblyr) ? project.asmblyr : {};
  const permissions = config.pluginPermissions;
  if (permissions !== undefined && !isRecord(permissions)) {
    throw new Error(
      "asmblyr.pluginPermissions must be an object keyed by package name",
    );
  }
  const requested = parseCapabilities(
    isRecord(manifest) ? manifest.capabilities : undefined,
  );
  const allowed = parseCapabilities(
    isRecord(permissions) && Object.hasOwn(permissions, name)
      ? permissions[name]
      : undefined,
  );
  const missing = requested.filter(
    (capability) => !allowed.includes(capability),
  );
  if (missing.length) {
    throw new Error(
      `Plugin ${name} requires approval in asmblyr.pluginPermissions: ${missing.join(", ")}`,
    );
  }
  return requested;
}

export function requireCapability(
  plugin: LoadedPlugin,
  capability: PluginCapability,
): void {
  if (!plugin.capabilities?.includes(capability)) {
    throw new EndpointError(
      403,
      "PLUGIN_CAPABILITY_DENIED",
      `Плагину не разрешена возможность: ${capability}`,
    );
  }
}

export function validatePluginCapabilities(plugin: LoadedPlugin): void {
  parseCapabilities(plugin.capabilities);
  if (plugin.collections?.length || plugin.migrations?.length) {
    requireCapability(plugin, "collections.manage");
  }
  if (plugin.settings) {
    requireCapability(plugin, "settings");
  }
  for (const hook of plugin.hooks ?? []) {
    requireCapability(
      plugin,
      hook.definition.event.startsWith("items.")
        ? "hooks.items"
        : "hooks.collections",
    );
  }
}

/** Capabilities narrow the existing caller-bound service; they never add user grants. */
export function capabilityItems(
  plugin: LoadedPlugin,
  items: ItemsService,
): ItemsService {
  return Object.freeze({
    async list(...args: Parameters<ItemsService["list"]>) {
      requireCapability(plugin, "items.read");
      return items.list(...args);
    },
    async get(...args: Parameters<ItemsService["get"]>) {
      requireCapability(plugin, "items.read");
      return items.get(...args);
    },
    async create(...args: Parameters<ItemsService["create"]>) {
      requireCapability(plugin, "items.write");
      const result = await items.create(...args);
      return plugin.capabilities?.includes("items.read")
        ? result
        : { data: null };
    },
    async update(...args: Parameters<ItemsService["update"]>) {
      requireCapability(plugin, "items.write");
      const result = await items.update(...args);
      return plugin.capabilities?.includes("items.read")
        ? result
        : { data: null };
    },
    async delete(...args: Parameters<ItemsService["delete"]>) {
      requireCapability(plugin, "items.write");
      return items.delete(...args);
    },
    async commit(...args: Parameters<ItemsService["commit"]>) {
      requireCapability(plugin, "items.write");
      requireCapability(plugin, "items.read");
      return items.commit(...args);
    },
  });
}
