export type {
  AsmblyrContext,
  EndpointActor,
  EndpointDefinition,
  EndpointHandler,
  EndpointLogger,
} from "./endpoint.js";
export { defineHandler } from "h3";
export { useAsmblyr } from "./context.js";
export { useItems } from "./use-items.js";
export { defineHook } from "./hook.js";
export type {
  HookContext,
  HookDefinition,
  HookEventName,
  HookEvents,
} from "./hook.js";
export { defineSettings, useSettings } from "./settings.js";
export type { SettingsValues } from "./settings.js";
export { pluginCapabilities, parseCapabilities } from "./capabilities.js";
export type { PluginCapability } from "./capabilities.js";
export { EndpointError } from "./endpoint-error.js";
export { defineCollection } from "./collection.js";
export { useStorage } from "./collection-storage.js";
export type { CollectionStorage } from "./collection-storage.js";
export type {
  CollectionRow,
  CollectionCreate,
  CollectionUpdate,
} from "./collection-types.js";
export { defineMigration } from "./migration.js";
export type { MigrationDefinition, MigrationOperation } from "./migration.js";
export type {
  CollectionDefinition,
  CollectionFieldDefinition,
  CollectionPresentation,
} from "./collection.js";
export type {
  ItemListOptions,
  ItemListResult,
  ItemMutationResult,
  ItemCommitDraft,
  ItemCommitRelation,
  ItemCommitResult,
  JsonRecord,
  ItemReadOptions,
  ItemRecord,
  ItemResult,
} from "@asmblyr-collaborative/contracts";
export type { ItemsReader, ItemsService } from "./items.js";
export type { PluginStorage } from "./storage.js";
export type {
  NotificationRecord,
  RecordNotificationInput,
  RecordNotifications,
} from "./notifications.js";
export type {
  ItemFilterCondition,
  ItemFilterGroup,
  ItemFilterOperator,
} from "@asmblyr-collaborative/contracts";

export { defineAction, useActionContext, ActionInputError } from "./action.js";
export type { ActionContext, PluginAction } from "./action.js";
export type {
  PersonalConnections,
  GoogleFile,
  GoogleFileList,
  GoogleText,
  GoogleSheet,
  GoogleCells,
  GoogleWriteInput,
} from "./connections.js";
export { AccessGate } from "./access-gate.js";
export {
  defineModelAnnotation,
  defineModelContext,
  bindModelDefinition,
} from "./model-context.js";
export type { ModelAnnotation } from "./model-context.js";

/** Endpoints and their action metadata are discovered in server/api. */
export type PluginDefinition = Readonly<Record<string, never>>;

/** Describes a plugin without registering or running it. */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  return definition;
}
