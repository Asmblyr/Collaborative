export type PluginSettingValue = string | number | boolean;
export type PluginSettingsValues = Record<string, PluginSettingValue>;

interface SettingLabel {
  label: string;
  description?: string;
}

export type PluginSettingField = SettingLabel &
  (
    | { type: "boolean"; default: boolean }
    | { type: "string"; default: string; maxLength: number }
    | {
        type: "number";
        default: number;
        min: number;
        max: number;
        integer?: boolean;
      }
    | {
        type: "select";
        default: string;
        options: readonly { value: string; label: string }[];
      }
  );

export interface PluginSettingsDefinition {
  title: string;
  description?: string;
  fields: Readonly<Record<string, PluginSettingField>>;
}

export interface PluginSettingsSnapshot {
  namespace: string;
  packageName: string;
  definition: PluginSettingsDefinition;
  values: PluginSettingsValues;
  /** Optimistic concurrency token. null means defaults have never been saved. */
  revision: string | null;
}
