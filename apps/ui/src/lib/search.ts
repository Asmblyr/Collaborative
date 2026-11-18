import { itemHref } from "./item-location";

export interface SearchResults {
  collections: { name: string; displayName?: string | null }[];
  items: { collection: string; id: string; label: string }[];
}

export function itemSearchHref(collection: string, id: string): string {
  return itemHref(collection, id);
}

export function searchReturnHref(
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  if (typeof query.q === "string" && query.q.trim()) {
    params.set("q", query.q.trim());
  }
  if (typeof query.workspace === "string" && query.workspace.length <= 128) {
    params.set("workspace", query.workspace);
  }
  return `/search${params.size ? `?${params}` : ""}`;
}
