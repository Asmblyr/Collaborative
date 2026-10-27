import type { TablePreferences } from "./table-preferences";
import type { TableView } from "@/components/items/table-view-dialog";

export function tableQueryDefaults(
  requested: Record<string, string | string[] | undefined>,
  preferences: TablePreferences | null,
  view: TableView | null,
  baseFilter: string,
) {
  const initial = ![
    "page",
    "limit",
    "sort",
    "direction",
    "q",
    "filter",
    "order",
  ].some((key) => typeof requested[key] === "string");
  const defaults = initial ? view?.definition : null;
  const q = typeof requested.q === "string" ? requested.q : (defaults?.q ?? "");
  let filter = baseFilter;
  if (typeof requested.filter === "string") {
    filter = requested.filter;
  } else if (preferences?.filter !== undefined) {
    filter = preferences.filter ? JSON.stringify(preferences.filter) : "";
  } else if (defaults) {
    filter = defaults.filter ? JSON.stringify(defaults.filter) : "";
  }
  let canonical: string | null = null;
  if (initial && (defaults || preferences?.filter !== undefined)) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(requested)) {
      if (typeof value === "string") {
        query.set(key, value);
      }
    }
    const sort = preferences?.sort ?? defaults!.sort;
    query.set("limit", String(preferences?.pageSize ?? defaults!.pageSize));
    query.set("sort", sort.field);
    query.set("order", sort.order ?? "field");
    query.set("direction", sort.direction);
    query.set("filter", filter);
    if (q) {
      query.set("q", q);
    }
    canonical = query.toString();
  }
  return { q, filter, canonical };
}
