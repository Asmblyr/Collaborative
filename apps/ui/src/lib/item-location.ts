export function collectionHref(collection: string): string {
  return `/items/${encodeURIComponent(collection)}`;
}

export function itemHref(collection: string, id: string): string {
  return `${collectionHref(collection)}/${encodeURIComponent(id)}`;
}

export function itemsPageHref(
  pathname: string,
  page: { number: number | bigint; size: number; sort: string; direction: "asc" | "desc" },
  q: string,
  filter: string,
): string {
  const query = new URLSearchParams({
    page: String(page.number),
    limit: String(page.size),
    sort: page.sort,
    direction: page.direction,
    // Keep an explicit reset distinct from an initial visit with no filter.
    filter,
  });
  if (q) query.set("q", q);
  return `${pathname}?${query}`;
}

export function isCollectionPath(pathname: string, collection: string): boolean {
  const base = collectionHref(collection);
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function recordIdFromPath(pathname: string, collection: string): string | null {
  const prefix = `${collectionHref(collection)}/`;
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length);
  if (!segment || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
