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
  ItemOrder,
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
export {
  columnWidthLimits,
  isColumnWidth,
  reconcileColumnWidths,
} from "./table-columns.js";
export type { ColumnPreferences } from "./table-columns.js";
export { presencePages } from "./presence.js";
export type {
  RealtimeActor,
  RealtimeEnvelope,
  RealtimeEvent,
  RealtimePayloads,
  RealtimeConnectionState,
  RealtimeSubscription,
} from "./realtime.js";
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
export type {
  CurrentUser,
  CurrentUserResult,
  UserProfilePatch,
  UserProfileExtension,
  UserProfileExtensionResult,
} from "./users.js";
export type { ApiErrorBody } from "./api-error.js";
export type {
  ExtensionEntry,
  ExtensionHistoryEntry,
  ExtensionListResult,
} from "./extension-registry.js";
export type { NotificationItem, NotificationResult } from "./notifications.js";
export type {
  SchemaValueType,
  SchemaFilterKind,
  SchemaPluginMethod,
  SchemaField,
  SchemaCollection,
  SchemaSnapshot,
  SchemaResult,
} from "./schema.js";
export type { FieldExtension } from "./field-extension.js";
export type {
  PluginSettingField,
  PluginSettingValue,
  PluginSettingsDefinition,
  PluginSettingsValues,
  PluginSettingsSnapshot,
} from "./plugin-settings.js";
export type {
  SearchPriority,
  CollectionMode,
  FieldType,
  PrimaryKey,
  PrimaryKeyType,
  Timestamps,
} from "./collections.js";

export { parseCalendarDate, parseBigintString } from "./scalar-values.js";
export {
  fieldConditionMatches,
  relationFilterDependencies,
  resolveRelationChoiceFilter,
} from "./field-rules.js";
export type { FieldRules, RelationChoiceFilter } from "./field-rules.js";

export interface AssistantUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
}

export interface AssistantToolDiagnostic {
  index: number;
  name: string;
  durationMs: number;
  status: "succeeded" | "failed";
  errorCode: string | null;
}

export interface AssistantTurnSummary {
  turnId: string;
  requestedModel: string;
  models: string[];
  modelCalls: number;
  toolCalls: number;
  toolErrors: number;
  /** At most 32 entries; no arguments, results or exception messages. */
  toolTrace?: AssistantToolDiagnostic[];
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
  translations?: import("./localization.js").LabelTranslations;
  label: string;
  description: string;
  placeholder: string;
  interface:
    | "auto"
    | "input"
    | "textarea"
    | "select"
    | "multiselect"
    | "tags"
    | "markdown"
    | "richtext"
    | "url"
    | "repeater";
  constraints?: FieldConstraints;
  rules?: import("./field-rules.js").FieldRules;
  relationFilter?: import("./field-rules.js").RelationChoiceFilter;
  /** Omit values from item history; value reads still follow field grants. */
  sensitive?: boolean;
  width: "full" | "half";
  order: number;
  group: string;
  /** Integer selects use numbers; text selects and JSON multiselects use strings. */
  options?: { value: string | number; label: string }[];
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
  AssistantDataAccess,
  AssistantSelection,
  AssistantSelectionQuery,
  AssistantFilterProposal,
  AssistantProgress,
  AssistantActivity,
  AssistantStreamEvent,
} from "./assistant.js";
export type {
  PluginActionResult,
  PluginPreparedAction,
  AssistantPluginResult,
} from "./plugin-actions.js";

export {
  uiLocales,
  themeStyles,
  resolveLocalizedText,
} from "./localization.js";
export type {
  UiLocale,
  ThemeStyle,
  ThemeMode,
  LabelTranslations,
  UserPreferences,
} from "./localization.js";
export type {
  TranslationMessages,
  TranslationCatalogs,
  TranslatedLabel,
  TranslationsResult,
} from "./translations.js";
export type {
  IntegrationSection,
  StorageConnection,
  AssistantConnection,
  EncryptionConnection,
  IntegrationValues,
  IntegrationSecret,
  IntegrationState,
  IntegrationsSnapshot,
  IntegrationUpdate,
} from "./integrations.js";
export type {
  MaterializedViewCandidate,
  ConnectMaterializedViewInput,
} from "./materialized-views.js";
export type { ServiceKey } from "./services.js";
export type {
  AssistantConversation,
  AssistantHistoryMessage,
  AssistantConversationPage,
  AssistantConversationDetail,
  AssistantConversationReceipt,
} from "./assistant-history.js";
export type { GoogleConnection } from "./integrations.js";
export type {
  PersonalConnectionStatus,
  ConnectionWriteProposal,
  ConnectionWriteDetail,
  ConnectionWriteResult,
  ConnectionWriteStatus,
} from "./connections.js";
export * from "./monitoring.js";
export * from "./tags.js";
export * from "./profile-display.js";
export type {
  SystemCollectionName,
  SystemCollectionRelation,
  SystemCollectionField,
  SystemCollection,
  SystemCollectionRecord,
  SystemRecordPage,
} from "./system-collections.js";
