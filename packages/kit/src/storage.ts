import type { ItemsService } from "./items.js";

/** Trusted server capability: plugin-owned collections only, local names, no SQL or actor override. */
export type PluginStorage = Omit<ItemsService, "commit">;
