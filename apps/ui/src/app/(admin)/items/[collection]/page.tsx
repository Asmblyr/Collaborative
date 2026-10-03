import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemsWorkspace } from "@/components/items/items-workspace";
import type { TablePreferences } from "@/lib/table-preferences";
import type { ItemList } from "@/components/items/types";
import { collectionHref, itemHref } from "@/lib/item-location";
import { loadCollections } from "@/lib/collections";
import { coreAddress, requireSession } from "@/lib/session";
import type { TableView } from "@/components/items/table-view-dialog";
import { defaultStateFilter } from "@/components/items/default-state-filter";

function LoadError({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-muted-foreground underline">
        ← К коллекциям
      </Link>
      <p role="alert">{message}</p>
    </div>
  );
}

export default async function CollectionItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string; id?: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { collection: name, id } = await params;
  const requested = await searchParams;
  const path = id === undefined ? collectionHref(name) : itemHref(name, id);
  const requestedQuery = new URLSearchParams();
  for (const [key, value] of Object.entries(requested))
    if (typeof value === "string") requestedQuery.set(key, value);
  const { user, token } = await requireSession(
    `${path}${requestedQuery.size ? `?${requestedQuery}` : ""}`,
  );
  // Keep previously shared search links working, with one canonical record URL.
  if (typeof requested.item === "string" && requested.item) {
    requestedQuery.delete("item");
    redirect(
      `${itemHref(name, id ?? requested.item)}${requestedQuery.size ? `?${requestedQuery}` : ""}`,
    );
  }
  const { data: collections, online } = await loadCollections(token);
  if (!online) return <LoadError message="Не удалось загрузить коллекции" />;
  const collection = collections.find((entry) => entry.name === name);
  if (!collection) notFound();

  let preferences: TablePreferences | null = null;
  let defaultView: TableView | null = null;
  if (collection.access.read) {
    try {
      const options = {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      } as const;
      const [response, viewResponse] = await Promise.all([
        fetch(coreAddress(`/users/me/table-preferences/${encodeURIComponent(name)}`), options),
        fetch(coreAddress(`/table-views/${encodeURIComponent(name)}/default`), options),
      ]);
      if (response.ok) preferences = (await response.json()).data;
      if (viewResponse.ok) defaultView = (await viewResponse.json()).data;
    } catch {
      /* Table data can load with the default layout. */
    }
  }
  let items: ItemList = {
    data: [],
    page: { number: 1, size: 25, total: "0", sort: collection.primaryKey.name, direction: "asc" },
  };
  const initialVisit = !["page", "limit", "sort", "direction", "q", "filter"].some(
    (key) => typeof requested[key] === "string",
  );
  const defaults = initialVisit ? defaultView?.definition : null;
  const layoutDefaults = defaultView?.definition;
  if (preferences && layoutDefaults)
    preferences = {
      ...preferences,
      columns: preferences.columns ?? layoutDefaults.columns,
      ...(!preferences.hasSaved
        ? { pageSize: layoutDefaults.pageSize, sort: layoutDefaults.sort }
        : {}),
    };
  // Keep the header search and reloadable URL in sync with a default view's query.
  if (defaults) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(requested))
      if (typeof value === "string") query.set(key, value);
    query.set("limit", String(preferences?.pageSize ?? defaults.pageSize));
    query.set("sort", preferences?.sort.field ?? defaults.sort.field);
    query.set("direction", preferences?.sort.direction ?? defaults.sort.direction);
    if (defaults.q) query.set("q", defaults.q);
    query.set("filter", defaults.filter ? JSON.stringify(defaults.filter) : "");
    redirect(`${path}?${query}`);
  }
  const q = typeof requested.q === "string" ? requested.q : "";
  const filter =
    typeof requested.filter === "string" ? requested.filter : defaultStateFilter(collection);
  if (collection.access.read) {
    let itemsResponse: Response;
    try {
      const query = new URLSearchParams({
        limit: String(preferences?.pageSize ?? 25),
        sort: preferences?.sort.field ?? collection.primaryKey.name,
        direction: preferences?.sort.direction ?? "asc",
      });
      if (q) query.set("q", q);
      if (filter) query.set("filter", filter);
      // An explicit empty filter disables the table default, but Core expects
      // either a JSON filter or no parameter at all.
      for (const key of ["page", "limit", "sort", "direction", "q"]) {
        const value = requested[key];
        if (typeof value === "string") query.set(key, value);
      }
      itemsResponse = await fetch(coreAddress(`/items/${encodeURIComponent(name)}?${query}`), {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      return <LoadError message="Не удалось загрузить записи" />;
    }
    if (!itemsResponse.ok) return <LoadError message="Не удалось загрузить записи" />;
    items = (await itemsResponse.json()) as ItemList;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ItemsWorkspace
        key={`${name}:${defaultView?.id}:${q}:${filter}:${items.page.number}`}
        collection={collection}
        catalog={collections}
        userId={user.id}
        superuser={user.superuser}
        items={items.data}
        labels={items.labels}
        page={items.page}
        preferences={preferences}
        q={q}
        filter={filter}
      />
    </div>
  );
}
