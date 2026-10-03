import type { CurrentUserResult } from "@asmblyr/contracts";
import {
  createItemsClient,
  type DynamicSchema,
  type ItemsClient,
} from "./items.js";
import type { ClientOptions, RequestOptions } from "./options.js";
import { createTransport } from "./transport.js";
import { createPresenceClient, type PresenceClient } from "./presence.js";

export interface AsmblyrClient<Schema extends object = DynamicSchema> {
  readonly items: ItemsClient<Schema>;
  readonly users: { me(request?: RequestOptions): Promise<CurrentUserResult> };
  readonly presence: PresenceClient;
}

export function createClient<Schema extends object = DynamicSchema>(
  options: ClientOptions,
): AsmblyrClient<Schema> {
  const transport = createTransport(options);
  return {
    items: createItemsClient<Schema>(transport),
    users: { me: (request) => transport.get("/users/me", undefined, request) },
    presence: createPresenceClient(transport),
  };
}
