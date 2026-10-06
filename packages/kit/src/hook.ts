import type { PluginSettingsValues } from "@asmblyr-collaborative/contracts";
import type { EndpointActor, EndpointLogger } from "./endpoint.js";
import type { ItemsReader } from "./items.js";
import type { PluginStorage } from "./storage.js";

export interface HookEvents {
  "items.create": { collection: string; collectionId: string; itemId: string };
  "items.update": { collection: string; collectionId: string; itemId: string };
  "items.delete": { collection: string; collectionId: string; itemId: string };
  "collections.delete": { collection: string; collectionId: string };
}

export type HookEventName = keyof HookEvents;

export interface HookContext {
  readonly actor: EndpointActor;
  readonly requestId: string;
  readonly logger: EndpointLogger;
  /** Reads use the caller's permissions and the current transaction. */
  readonly items: ItemsReader;
  /** Trusted lifecycle cleanup is limited to this package's collections. */
  readonly storage?: PluginStorage;
  readonly settings?: Readonly<PluginSettingsValues>;
}

export type HookDefinition<E extends HookEventName = HookEventName> = {
  [K in E]: {
    readonly event: K;
    readonly handle: (
      event: Readonly<HookEvents[K]>,
      context: HookContext,
    ) => Promise<void> | void;
  };
}[E];

/** Runs inside the mutation transaction. Throwing rolls back the whole operation. */
export function defineHook<E extends HookEventName>(
  event: E,
  handle: (
    event: Readonly<HookEvents[E]>,
    context: HookContext,
  ) => Promise<void> | void,
): HookDefinition<E> {
  return { event, handle } as HookDefinition<E>;
}
