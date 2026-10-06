import type { ComponentType } from "react";
import type { JsonRecord } from "@asmblyr-collaborative/contracts";

export interface FieldEditorProps {
  id: string;
  label: string;
  value: string;
  options: JsonRecord;
  disabled: boolean;
  required: boolean;
  placeholder?: string;
  describedBy?: string;
  onChange(value: string): void;
}

export interface FieldDisplayProps {
  value: string | null;
  options: JsonRecord;
}

export interface FieldInterfaceSettingsProps {
  options: JsonRecord;
  disabled: boolean;
  onChange(options: JsonRecord): void;
}

/** Version one supports text storage; values use the host's ordinary draft. */
export interface FieldInterfaceDefinition {
  id: string;
  title: string;
  titleKey?: string;
  types: readonly "text"[];
  editor: ComponentType<FieldEditorProps>;
  display?: ComponentType<FieldDisplayProps>;
  settings?: ComponentType<FieldInterfaceSettingsProps>;
}
