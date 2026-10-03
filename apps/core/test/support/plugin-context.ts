import type { EndpointActor, ItemsService } from "@asmblyr/kit";

/** HTTP adapter tests do not use a database. Data access has separate integration tests. */
export function pluginContext(actor: EndpointActor) {
  const unavailable = async (): Promise<never> => {
    throw new Error("Items are unavailable in HTTP-only tests");
  };
  const items: ItemsService = Object.freeze({
    list: unavailable,
    get: unavailable,
    create: unavailable,
    update: unavailable,
    delete: unavailable,
    commit: unavailable,
  });
  return { actor, items };
}
