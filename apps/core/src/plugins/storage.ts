import type { PluginStorage } from "@asmblyr/kit";
import type { Knex } from "knex";
import { AccessDeniedError, type Access } from "../permissions/access.js";
import type { LoadedPlugin } from "./definition.js";
import { createItemsService } from "./items.js";
import { mutationContext } from "../items/mutation-context.js";

/** A package capability, not user permissions. Never exposed through HTTP/SDK. */
export function createPluginStorage(
  database: Knex,
  access: Access,
  plugin: LoadedPlugin,
  requestId?: string,
): PluginStorage | undefined {
  if (!plugin.namespace || !plugin.capabilities?.includes("storage.own")) {
    return undefined;
  }
  const names = new Map(
    (plugin.collections ?? []).map((entry) => [
      entry.localName,
      entry.input.name,
    ]),
  );
  const grants = new Map<string, string[]>();
  for (const name of names.values()) {
    for (const action of ["read", "create", "update", "delete"]) {
      grants.set(`${name}:${action}`, ["*"]);
    }
  }
  // Preserve real audit identity. Even a superuser gets only this package's storage capability.
  const storageAccess: Access = {
    principal: { ...access.principal, superuser: false },
    grants,
  };
  const items = createItemsService(database, storageAccess, () => ({
    ...mutationContext(access),
    ...(requestId ? { requestId } : {}),
  }));
  function owned(local: string): string {
    const name = names.get(local);
    if (!name) {
      throw new AccessDeniedError();
    }
    return name;
  }
  return Object.freeze({
    list: (local, options) => items.list(owned(local), options),
    get: (local, id, options) => items.get(owned(local), id, options),
    create: (local, values) => items.create(owned(local), values),
    update: (local, id, values) => items.update(owned(local), id, values),
    delete: (local, id) => items.delete(owned(local), id),
  } satisfies PluginStorage);
}
