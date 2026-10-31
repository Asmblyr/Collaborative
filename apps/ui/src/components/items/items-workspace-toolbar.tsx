"use client";

import type { ReactNode } from "react";
import type { ColumnPreferences } from "@/lib/table-preferences";
import { Badge } from "@asmblyr-collaborative/kit/ui/badge";
import { PresenceAvatars } from "@/components/presence/presence-avatars";
import { ItemFilters } from "./item-filters";
import { ItemFilterSummary } from "./item-filter-summary";
import { ItemSearchOrder } from "./item-search-order";
import { ItemViewMenu } from "./item-table-controls";
import type { TableView } from "./table-view-dialog";
import type { ItemColumn } from "./use-item-columns";
import type { Collection, ItemPage } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemsWorkspaceToolbar({
  collection,
  catalog,
  userId,
  hasItems,
  page,
  q,
  filter,
  allColumns,
  visibleColumns,
  views,
  hasLegacyColumns,
  onImportLegacyColumns,
  onApplyColumnSnapshot,
  onToggleColumn,
  onManageViews,
  onNavigate,
  createButton,
}: {
  collection: Collection;
  catalog: Collection[];
  userId: string;
  hasItems: boolean;
  page: ItemPage;
  q: string;
  filter: string;
  allColumns: ItemColumn[];
  visibleColumns: ItemColumn[];
  views: TableView[];
  hasLegacyColumns: boolean;
  onImportLegacyColumns: () => void;
  onApplyColumnSnapshot: (columns: ColumnPreferences) => void;
  onToggleColumn: (name: string, show: boolean) => void;
  onManageViews: () => void;
  onNavigate: (
    changes: Partial<ItemPage>,
    nextFilter?: string,
    nextQuery?: string,
  ) => void;
  createButton: ReactNode;
}) {
  const copy = useUiCopy();

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
        <PresenceAvatars
          scope={{ kind: "collection", collection: collection.name }}
        />
        {collection.sourceKind === "materialized-view" && (
          <Badge variant="secondary">{copy("Только просмотр")}</Badge>
        )}
        {collection.mode === "single" && (
          <span className="text-sm text-muted-foreground">
            {copy("Коллекция с одним объектом")}
          </span>
        )}
        {hasItems && (
          <span className="hidden text-xs text-muted-foreground lg:block">
            {copy("Нажмите на строку, чтобы открыть запись")}
          </span>
        )}
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
          <ItemFilters
            collection={collection}
            catalog={catalog}
            userId={userId}
            filter={filter}
            onApply={(group) =>
              onNavigate({ number: 1 }, group ? JSON.stringify(group) : "")
            }
          />
          {q.trim() && (
            <ItemSearchOrder
              value={page.order ?? "field"}
              onChange={(order) => onNavigate({ number: 1, order })}
            />
          )}
          <ItemViewMenu
            all={allColumns}
            visible={visibleColumns}
            views={views}
            onManageViews={onManageViews}
            onApplyView={(view) => {
              if (!view.definition) {
                return;
              }
              onApplyColumnSnapshot(view.definition.columns);
              onNavigate(
                {
                  number: 1,
                  size: view.definition.pageSize,
                  sort: view.definition.sort.field,
                  order: view.definition.sort.order ?? "field",
                  direction: view.definition.sort.direction,
                },
                view.definition.filter
                  ? JSON.stringify(view.definition.filter)
                  : "",
                view.definition.q,
              );
            }}
            onImport={hasLegacyColumns ? onImportLegacyColumns : undefined}
            onToggle={onToggleColumn}
          />
          {createButton}
        </div>
      </div>
      <ItemFilterSummary
        collection={collection}
        catalog={catalog}
        q={q}
        filter={filter}
        onChange={(nextFilter, nextQuery) =>
          onNavigate({ number: 1 }, nextFilter, nextQuery)
        }
      />
    </>
  );
}
