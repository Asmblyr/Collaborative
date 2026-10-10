import type {
  TranslationsResult,
  UiLocale,
  SchemaResult,
} from "@asmblyr-collaborative/contracts";
import {
  createItemsClient,
  type DynamicSchema,
  type ItemsClient,
} from "./items.js";
import type { ClientOptions, RequestOptions } from "./options.js";
import { createTransport } from "./transport.js";
import { createPresenceClient, type PresenceClient } from "./presence.js";
import { createRealtimeClient } from "./realtime.js";
import {
  createNotificationsClient,
  type NotificationsClient,
} from "./notifications.js";
import type { ClientSchema, FieldDefinitions } from "./query/definition.js";
import { createFluentClient, type FluentClient } from "./query/client.js";
import { createPluginsClient, type PluginsClient } from "./plugins.js";
import { createUsersClient, type UsersClient } from "./users.js";
import { createExtensionsClient, type ExtensionsClient } from "./extensions.js";

export interface AsmblyrClient<Schema extends object = DynamicSchema> {
  readonly items: ItemsClient<Schema>;
  readonly users: UsersClient<Schema>;
  readonly extensions: ExtensionsClient;
  readonly presence: PresenceClient;
  readonly realtime: ReturnType<typeof createRealtimeClient>;
  readonly notifications: NotificationsClient;
  readonly schema: { pull(request?: RequestOptions): Promise<SchemaResult> };
  readonly translations: {
    get(
      locale?: UiLocale,
      request?: RequestOptions,
    ): Promise<TranslationsResult>;
  };
}

export function createClient<
  Schema extends object,
  Fields extends FieldDefinitions<Schema>,
  Aliases extends Record<string, Extract<keyof Schema, string>>,
  Methods extends object,
>(
  options: ClientOptions & {
    schema: ClientSchema<Schema, Fields, Aliases, Methods>;
  },
): AsmblyrClient<Schema> &
  FluentClient<Schema, Fields, Aliases> & {
    readonly plugins: PluginsClient<Methods>;
  };
export function createClient<Schema extends object = DynamicSchema>(
  options: ClientOptions,
): AsmblyrClient<Schema>;
export function createClient<Schema extends object = DynamicSchema>(
  options: ClientOptions & {
    schema?: ClientSchema<
      Schema,
      FieldDefinitions<Schema>,
      Record<string, Extract<keyof Schema, string>>,
      object
    >;
  },
): AsmblyrClient<Schema> {
  const transport = createTransport(options);
  const items = createItemsClient<Schema>(transport);
  return {
    ...(options.schema ? createFluentClient(options.schema, transport) : {}),
    ...(options.schema
      ? { plugins: createPluginsClient(options.schema.plugins, transport) }
      : {}),
    items,
    users: createUsersClient<Schema>(transport),
    extensions: createExtensionsClient(transport),
    presence: createPresenceClient(transport),
    realtime: createRealtimeClient(options, transport),
    notifications: createNotificationsClient(transport),
    schema: { pull: (request) => transport.get("/schema", undefined, request) },
    translations: {
      get: (locale, request) =>
        transport.get(
          "/translations",
          locale ? new URLSearchParams({ locale }) : undefined,
          request,
        ),
    },
  };
}
