import type { ComponentType } from "react";
import type { PluginPreparedAction } from "@asmblyr/contracts";
import type { FieldInterfaceDefinition } from "./field-interface.js";
export type {
  FieldInterfaceDefinition,
  FieldEditorProps,
  FieldDisplayProps,
  FieldInterfaceSettingsProps,
} from "./field-interface.js";

/** Same-origin authenticated proxy. Paths are relative to the plugin's HTTP namespace. */
export interface PluginRequest {
  <T>(path: string, init?: RequestInit): Promise<T>;
}

export interface RecordPanelProps {
  record: { collection: string; id: string; displayName: string };
  /** Same-origin authenticated proxy. Paths are relative to this plugin's HTTP namespace. */
  request: PluginRequest;
  /** Include panel drafts and requests in the editor's unsaved-change/busy protection. */
  onStateChange(state: { dirty: boolean; busy: boolean }): void;
}

export interface RecordPanelDefinition {
  id: string;
  title: string;
  component: ComponentType<RecordPanelProps>;
  supports?(record: RecordPanelProps["record"]): boolean;
}

export interface UiPluginDefinition {
  fieldInterfaces?: readonly FieldInterfaceDefinition[];
  recordPanels?: readonly RecordPanelDefinition[];
  pages?: readonly PluginPageDefinition[];
}

export interface PluginPageProps {
  request: PluginRequest;
  preparedAction?: PluginPreparedAction;
  onStateChange(state: { dirty: boolean; busy: boolean }): void;
}

export interface PluginPageDefinition {
  /** Unique within this plugin; forms /extensions/<namespace>/<id>. */
  id: string;
  title: string;
  component: ComponentType<PluginPageProps>;
}

/** Browser-only entry point: does not import H3, Node or server plugin code. */
export function defineUiPlugin(
  definition: UiPluginDefinition,
): UiPluginDefinition {
  for (const entries of [
    definition.pages ?? [],
    definition.recordPanels ?? [],
    definition.fieldInterfaces ?? [],
  ]) {
    const ids = new Set<string>();
    for (const entry of entries) {
      if (!/^[a-z][a-z0-9-]*$/.test(entry.id) || !entry.title.trim()) {
        throw new Error("Plugin UI entries require a URL-safe id and a title");
      }
      if (ids.has(entry.id)) {
        throw new Error(`Duplicate plugin UI entry: ${entry.id}`);
      }
      ids.add(entry.id);
    }
  }
  for (const field of definition.fieldInterfaces ?? []) {
    if (field.id.length > 64) {
      throw new Error("Field interface IDs must not exceed 64 characters");
    }
    if (!field.types.length || field.types.some((type) => type !== "text")) {
      throw new Error("Field interfaces currently support text storage only");
    }
  }
  return definition;
}
