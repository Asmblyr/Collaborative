import type {
  PluginSettingsDefinition,
  PluginSettingsValues,
} from "@asmblyr-collaborative/contracts";

export type SettingsValues<D extends PluginSettingsDefinition> = {
  readonly [K in keyof D["fields"]]: D["fields"][K]["type"] extends "boolean"
    ? boolean
    : D["fields"][K]["type"] extends "number"
      ? number
      : string;
};

export function defineSettings<const D extends PluginSettingsDefinition>(
  definition: D,
): D {
  return definition;
}

/** Core validates and snapshots the current package's settings before invoking it. */
export function useSettings<D extends PluginSettingsDefinition>(
  context: { readonly settings?: Readonly<PluginSettingsValues> },
  definition: D,
): SettingsValues<D> {
  if (!context.settings) {
    throw new Error("Plugin settings are unavailable in this context");
  }
  const values: PluginSettingsValues = {};
  for (const key of Object.keys(definition.fields)) {
    if (!Object.hasOwn(context.settings, key)) {
      throw new Error(`Missing plugin setting: ${key}`);
    }
    values[key] = context.settings[key];
  }
  return Object.freeze(values) as SettingsValues<D>;
}
