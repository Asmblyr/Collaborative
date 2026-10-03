import type { H3Event } from "h3";
import type { ItemsService } from "./items.js";

/** The same caller-bound data API in regular endpoints and model handlers. */
export function useItems(event: H3Event): ItemsService {
  const items = event.context.asmblyrAction?.items ?? event.context.asmblyr?.items;
  if (!items) throw new Error("Items are unavailable outside an authenticated Core request");
  return items;
}
