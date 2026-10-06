export const pluginCapabilities = [
  "connections.google",
  "identity.profile",
  "items.read",
  "items.write",
  "collections.manage",
  "storage.own",
  "hooks.items",
  "hooks.collections",
  "settings",
  "notifications",
] as const;

export type PluginCapability = (typeof pluginCapabilities)[number];

export function parseCapabilities(value: unknown): PluginCapability[] {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => !pluginCapabilities.includes(entry)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("Expected unique known plugin capabilities");
  }
  return [...value] as PluginCapability[];
}
