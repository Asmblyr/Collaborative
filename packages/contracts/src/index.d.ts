export type {
  ItemFilterCondition,
  ItemFilterGroup,
  ItemFilterOperator,
} from "./item-filter.js";
export { permissionContextParameters } from "./permission-filter.js";
export type {
  PermissionContextPath,
  PermissionOperand,
  PermissionCondition,
  PermissionFilter,
  PermissionRule,
} from "./permission-filter.js";
export type {
  ItemListOptions,
  ItemListResult,
  ItemMutationResult,
  ItemPage,
  ItemReadOptions,
  ItemRecord,
  ItemResult,
  JsonRecord,
  JsonValue,
} from "./items.js";
export type {
  ItemCommitDraft,
  ItemCommitRelation,
  ItemCommitResult,
} from "./item-commit.js";
export { settingsSections } from "./settings-access.js";
export { presencePages } from "./presence.js";
export type {
  PresenceScope,
  PresenceInput,
  PresenceParticipant,
  PresenceResult,
} from "./presence.js";
export type {
  SettingsSection,
  SettingsAccess,
  SettingsPermissionInput,
  UserDelegationInput,
  PolicyUsersInput,
} from "./settings-access.js";
export type { CurrentUser, CurrentUserResult } from "./users.js";
export type { ApiErrorBody } from "./api-error.js";
export type { FieldExtension } from "./field-extension.js";
export type {
  PluginSettingField,
  PluginSettingValue,
  PluginSettingsDefinition,
  PluginSettingsValues,
  PluginSettingsSnapshot,
} from "./plugin-settings.js";
export type {
  CollectionMode,
  FieldType,
  PrimaryKey,
  PrimaryKeyType,
  Timestamps,
} from "./collections.js";

export interface AssistantUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
}

export interface AssistantTurnSummary {
  turnId: string;
  requestedModel: string;
  models: string[];
  modelCalls: number;
  toolCalls: number;
  toolErrors: number;
  durationMs: number;
  status: "succeeded" | "failed" | "cancelled";
  errorCode: string | null;
  // Known sums only. Each counter has its own number of reported samples.
  usage: AssistantUsage;
  usageSamples: Record<keyof AssistantUsage, number>;
}

export const richTextSanitizerOptions: {
  allowedTags: string[];
  allowedAttributes: { a: string[] };
  allowedSchemes: string[];
  allowProtocolRelative: boolean;
};

export interface RepeaterField {
  name: string;
  label: string;
  type: "text" | "email" | "integer" | "decimal" | "boolean" | "datetime";
  interface: "auto" | "textarea" | "markdown" | "url" | "select";
  required: boolean;
  width: "full" | "half";
  options?: { value: string; label: string }[];
}
export interface RepeaterSettings {
  fields: RepeaterField[];
  labelField: string | null;
  minItems: number;
  maxItems: number;
}

export type ValueDisplay =
  | {
      kind: "status";
      statuses: {
        value: string;
        label: string;
        color: "gray" | "blue" | "green" | "amber" | "red" | "violet";
      }[];
    }
  | {
      kind: "number";
      decimals: number;
      grouping: boolean;
      prefix: string;
      suffix: string;
    }
  | { kind: "date"; format: "date" | "datetime" | "time"; timeZone: string };

export interface FormCondition {
  mode: "all" | "any";
  rules: {
    field: string;
    operator: "eq" | "ne" | "empty" | "notEmpty";
    value?: string | number | boolean;
  }[];
}
export type FormNode = { id: string; when?: FormCondition } & (
  | { kind: "field"; field: string; width: "full" | "half" }
  | {
      kind: "group";
      label: string;
      description: string;
      collapsible: boolean;
      collapsed: boolean;
      children: FormNode[];
    }
);
export interface FormLayout {
  version: 1;
  tabs: { id: string; label: string; children: FormNode[] }[];
}

export interface RelationPresentation {
  layout: "list" | "table";
  columns: string[];
  labelField: string | null;
  sortField: string | null;
  direction: "asc" | "desc";
  pageSize: 10 | 25 | 50;
  allowCreate: boolean;
  allowSelect: boolean;
}

export interface FieldPresentation {
  label: string;
  description: string;
  placeholder: string;
  interface:
    | "auto"
    | "input"
    | "textarea"
    | "select"
    | "multiselect"
    | "markdown"
    | "richtext"
    | "url"
    | "repeater";
  constraints?: FieldConstraints;
  width: "full" | "half";
  order: number;
  group: string;
  options?: { value: string; label: string }[];
  relation?: RelationPresentation;
  repeater?: RepeaterSettings;
  display?: ValueDisplay;
  extension?: import("./field-extension.js").FieldExtension;
}

export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface CollectionState {
  field: "status";
  defaultValue: string;
  statuses: {
    value: string;
    label: string;
    color: "gray" | "blue" | "green" | "amber" | "red" | "violet";
    hidden: boolean;
  }[];
}

export function defaultCollectionState(): CollectionState;

export interface TermDefinition {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  enabled: boolean;
  builtin: boolean;
}

export type TermInput = Pick<
  TermDefinition,
  "name" | "description" | "aliases" | "enabled"
>;
export type {
  AssistantSelection,
  AssistantSelectionQuery,
  AssistantFilterProposal,
  AssistantProgress,
  AssistantStreamEvent,
} from "./assistant.js";
export type {
  PluginActionResult,
  PluginPreparedAction,
  AssistantPluginResult,
} from "./plugin-actions.js";
