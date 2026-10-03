import { itemHref } from "./item-location";

export interface SearchResults {
  collections: { name: string; displayName?: string | null }[];
  items: { collection: string; id: string; label: string }[];
}

export function itemSearchHref(collection: string, id: string): string {
  return itemHref(collection, id);
}
