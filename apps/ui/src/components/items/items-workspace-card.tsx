"use client";

import type { ReactNode } from "react";
import { useAssistantHost } from "@/components/assistant/assistant-host";
import { cn } from "@/lib/utils";
import { useUiCopy } from "@/lib/ui-copy";
import { ItemEmptyState } from "./item-empty-state";
import { ItemPagination } from "./item-pagination";
import { ItemsTable } from "./items-table";
import { ItemsWorkspaceToolbar } from "./items-workspace-toolbar";
import type { TableView } from "./table-view-dialog";
import type { Collection, Item, ItemPage } from "./types";
import { useColumnVisibilityMotion } from "./use-column-visibility-motion";
import type { useItemColumns } from "./use-item-columns";

export function ItemsWorkspaceCard({
  collection,
  catalog,
  userId,
  items,
  labels,
  initialRelationLabels,
  page,
  pathname,
  q,
  filter,
  columns,
  views,
  selected,
  disabled,
  navigating,
  canCreate,
  createButton,
  onManageViews,
  onNavigate,
  onOpenCreate,
  onSelect,
  onSelectPage,
  onOpenRecord,
}: {
  collection: Collection;
  catalog: Collection[];
  userId: string;
  items: Item[];
  labels?: Record<string, string>;
  initialRelationLabels?: Record<string, string>;
  page: ItemPage;
  pathname: string;
  q: string;
  filter: string;
  columns: ReturnType<typeof useItemColumns>;
  views: TableView[];
  selected: Set<string>;
  disabled: boolean;
  navigating: boolean;
  canCreate: boolean;
  createButton: ReactNode;
  onManageViews: () => void;
  onNavigate: (
    changes: Partial<ItemPage>,
    nextFilter?: string,
    nextQuery?: string,
  ) => void;
  onOpenCreate: () => void;
  onSelect: (id: string, checked: boolean) => void;
  onSelectPage: (checked: boolean) => void;
  onOpenRecord: (item: Item) => void;
}) {
  const copy = useUiCopy();
  const assistantAvailable = Boolean(useAssistantHost()?.available);
  const {
    root: columnRoot,
    layer: columnLayer,
    change: changeColumnVisibility,
  } = useColumnVisibilityMotion();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
      <ItemsWorkspaceToolbar
        collection={collection}
        catalog={catalog}
        userId={userId}
        hasItems={items.length > 0}
        page={page}
        q={q}
        filter={filter}
        allColumns={columns.all}
        visibleColumns={columns.visible}
        views={views}
        hasLegacyColumns={columns.hasLegacy}
        onImportLegacyColumns={columns.importLegacy}
        onApplyColumnSnapshot={columns.apply}
        onToggleColumn={(name, show) =>
          changeColumnVisibility(name, show, () => {
            columns.toggle(name, show);
            if (!show && page.sort === name) {
              onNavigate({
                number: 1,
                sort: collection.primaryKey.name,
                direction: "asc",
              });
            }
          })
        }
        onManageViews={onManageViews}
        onNavigate={onNavigate}
        createButton={createButton}
      />
      <div
        ref={columnRoot}
        aria-busy={navigating || undefined}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-hidden border-t transition-opacity duration-150",
          navigating && "opacity-65",
        )}
      >
        {items.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <ItemEmptyState
              filtered={Boolean(q || filter)}
              outOfRange={page.total !== "0"}
              onCreate={canCreate ? onOpenCreate : undefined}
              onReset={() => onNavigate({ number: 1 }, "", "")}
              onFirstPage={() => onNavigate({ number: 1 })}
            />
          </div>
        ) : (
          <ItemsTable
            collection={collection}
            catalog={catalog}
            items={items}
            recordLabels={labels}
            initialRelationLabels={initialRelationLabels}
            columns={columns.visible}
            widths={columns.snapshot.widths ?? {}}
            page={page}
            selected={selected}
            disabled={disabled}
            onSelect={onSelect}
            onSelectPage={onSelectPage}
            onOpen={onOpenRecord}
            onSort={(name) =>
              onNavigate({
                number: 1,
                sort: name,
                order: "field",
                direction:
                  page.order !== "relevance" &&
                  page.sort === name &&
                  page.direction === "asc"
                    ? "desc"
                    : "asc",
              })
            }
            onMove={columns.move}
            onResize={columns.resize}
          />
        )}
        <div
          ref={columnLayer}
          aria-hidden="true"
          inert
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        />
      </div>
      {collection.mode === "multiple" && (
        <div
          className={cn(
            "shrink-0 border-t px-4 py-3",
            assistantAvailable && "sm:pr-20",
          )}
        >
          {page.total === "0" ? (
            <p className="text-sm text-muted-foreground">
              {q || filter ? copy("Найдено") : copy("Записей")}: 0
            </p>
          ) : (
            <ItemPagination
              page={page}
              pathname={pathname}
              q={q}
              filter={filter}
              pending={navigating}
              onPage={(number) => onNavigate({ number })}
              onSize={(size) => onNavigate({ number: 1, size })}
            />
          )}
        </div>
      )}
    </div>
  );
}
