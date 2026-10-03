import type { EventHandler } from "h3";
import type { ItemsService } from "./items.js";
import type { PluginStorage } from "./storage.js";
import type { PluginSettingsValues } from "@asmblyr/contracts";

export interface EndpointActor {
  readonly id: string;
  readonly kind: "user" | "service";
  readonly displayName?: string;
}

export interface EndpointLogger {
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

export interface AsmblyrContext {
  readonly actor: EndpointActor;
  readonly requestId: string;
  readonly logger: EndpointLogger;
  readonly items: ItemsService;
  /** Requires storage.own and a namespace. Domain authorization belongs to the endpoint. */
  readonly storage?: PluginStorage;
  readonly settings?: Readonly<PluginSettingsValues>;
  /** Holds a readable target row while updating related plugin data atomically. */
  readonly withRecord?: <T>(
    collection: string,
    id: string | number,
    run: (context: AsmblyrContext) => Promise<T>,
  ) => Promise<T>;
}

export type EndpointHandler = EventHandler;

export interface EndpointDefinition {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Core path without /api. The first segment belongs to this plugin. */
  readonly path: string;
  readonly handler: EndpointHandler;
}
