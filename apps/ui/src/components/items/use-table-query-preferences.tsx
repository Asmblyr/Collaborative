"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { replaceShallowHistory } from "@/lib/history-state";
import { requestJson } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";
import { TablePreferenceWriter } from "./table-preference-writer";
import type {
  TablePreferences,
  TableQueryPatch,
} from "@/lib/table-preferences";
import type { ItemPage } from "./types";
import { tableQuerySnapshot } from "@/lib/table-preferences";
import { readFilter } from "./item-filter-options";
import type { ItemFilterGroup } from "@asmblyr-collaborative/contracts";

const writers = new Map<string, TablePreferenceWriter>();

export function useTableQueryPreferences(
  userId: string,
  collection: string,
  page: ItemPage,
  filter: string,
  preferences: TablePreferences | null,
) {
  const key = `${userId}:${collection}`;
  let writer = writers.get(key);
  if (!writer) {
    const path = `/api/users/me/table-preferences/${encodeURIComponent(collection)}`;
    writer = new TablePreferenceWriter((patch) =>
      requestJson(path, "PATCH", patch, AbortSignal.timeout(10000)),
    );
    writers.set(key, writer);
  }
  const status = useSyncExternalStore(
    writer.subscribe,
    writer.getSnapshot,
    () => "idle",
  );
  const appliedFilter = readFilter(filter);
  const current = tableQuerySnapshot({
    pageSize: page.size,
    sort: {
      field: page.sort,
      direction: page.direction,
      order: page.order ?? "field",
    },
    filter: appliedFilter.children.length
      ? (appliedFilter as ItemFilterGroup)
      : null,
  });
  const saved = preferences
    ? tableQuerySnapshot({
        pageSize: preferences.pageSize,
        sort: {
          field: preferences.sort.field,
          direction: preferences.sort.direction,
          order: preferences.sort.order ?? "field",
        },
        filter: preferences.filter,
      })
    : null;
  useEffect(() => {
    if (
      saved === null ||
      (current === saved && writer.getSnapshot() === "idle")
    ) {
      return;
    }
    void writer.save(JSON.parse(current) as TableQueryPatch);
  }, [writer, current, saved]);
  return { save: writer.save, retry: writer.retry, status };
}

export function TablePreferencesNotice({
  status,
  retry,
}: Pick<ReturnType<typeof useTableQueryPreferences>, "status" | "retry">) {
  const copy = useUiCopy();
  if (status !== "error") {
    return null;
  }
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-sm text-destructive"
    >
      {copy("Не удалось сохранить настройки таблицы.")}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void retry()}
      >
        {copy("Повторить")}
      </Button>
    </div>
  );
}

const TABLE_QUERY_KEYS = [
  "page",
  "limit",
  "sort",
  "direction",
  "q",
  "filter",
  "order",
];

export function resolveCanonicalTableHref(
  pathname: string,
  search: string,
  hash: string,
  canonicalQuery: string | null | undefined,
): string | null {
  if (!canonicalQuery) {
    return null;
  }

  const currentParams = new URLSearchParams(search);
  if (TABLE_QUERY_KEYS.some((key) => currentParams.has(key))) {
    return null;
  }

  const merged = new URLSearchParams(canonicalQuery);
  const activeWorkspace = currentParams.get("workspace");
  if (activeWorkspace && !merged.has("workspace")) {
    merged.set("workspace", activeWorkspace);
  }

  return `${pathname}?${merged}${hash}`;
}

export function useCanonicalTableQuery(canonicalQuery: string | null): void {
  useEffect(() => {
    const nextHref = resolveCanonicalTableHref(
      window.location.pathname,
      window.location.search,
      window.location.hash,
      canonicalQuery,
    );
    if (!nextHref) {
      return;
    }

    replaceShallowHistory(nextHref);
  }, [canonicalQuery]);
}
