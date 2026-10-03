import type { MutationFactory } from "../items/mutation-context.js";
import type { ItemsService } from "@asmblyr/kit";
import type { Knex } from "knex";
import { AccessDeniedError, type Access } from "../permissions/access.js";
import { createItemsService } from "./items.js";
import { mcpActionAccess } from "./action-access.js";

export interface ActionScope {
  mcp: boolean;
  readOnly: boolean;
  signal: AbortSignal;
}

/** No SQL, privileged plugin storage, or identity override is exposed to model handlers. */
export function createActionItems(
  database: Knex,
  access: Access,
  scope: ActionScope,
  mutations?: MutationFactory,
): ItemsService {
  async function service(write = false): Promise<ItemsService> {
    scope.signal.throwIfAborted();
    if (write && scope.readOnly) {
      throw new AccessDeniedError();
    }
    const effectiveAccess = scope.mcp
      ? await mcpActionAccess(database, access)
      : access;
    scope.signal.throwIfAborted();
    return createItemsService(database, effectiveAccess, mutations);
  }
  return Object.freeze({
    async list(...args: Parameters<ItemsService["list"]>) {
      return (await service()).list(...args);
    },
    async get(...args: Parameters<ItemsService["get"]>) {
      return (await service()).get(...args);
    },
    async create(...args: Parameters<ItemsService["create"]>) {
      return (await service(true)).create(...args);
    },
    async update(...args: Parameters<ItemsService["update"]>) {
      return (await service(true)).update(...args);
    },
    async delete(...args: Parameters<ItemsService["delete"]>) {
      return (await service(true)).delete(...args);
    },
    async commit(...args: Parameters<ItemsService["commit"]>) {
      return (await service(true)).commit(...args);
    },
  });
}
