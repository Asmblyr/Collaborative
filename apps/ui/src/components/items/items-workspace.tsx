"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { TablePreferences } from "@/lib/table-preferences";
import { itemsPageHref } from "@/lib/item-location";
import { Button } from "@asmblyr/kit/ui/button";
import { ItemEditorDialog } from "./item-editor-dialog";
import { ItemEmptyState } from "./item-empty-state";
import { ItemFilterSummary } from "./item-filter-summary";
import { ItemBulkDialog } from "./item-bulk-dialog";
import { ItemSelectionBar } from "./item-selection-bar";
import { ItemFilters } from "./item-filters";
import { ItemViewMenu } from "./item-table-controls";
import { ItemPagination } from "./item-pagination";
import { useRecordLocation } from "./use-record-location";
import { ItemsTable } from "./items-table";
import { useTableViews } from "./use-table-views";
import { useItemSelection } from "./use-item-selection";
import { useItemColumns } from "./use-item-columns";
import { useColumnVisibilityMotion } from "./use-column-visibility-motion";
import { TableViewDialog } from "./table-view-dialog";
import { readFilter } from "./item-filter-options";
import type { Collection, Item, ItemPage } from "./types";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { AssistantTableContext } from "@/components/assistant/assistant-context";

export function ItemsWorkspace({
  collection,
  catalog,
  userId,
  superuser,
  items,
  labels,
  page,
  q,
  filter,
  preferences,
}: {
  collection: Collection;
  catalog: Collection[];
  userId: string;
  items: Item[];
  page: ItemPage;
  q: string;
  filter: string;
  labels?: Record<string, string>;
  preferences: TablePreferences | null;
  superuser: boolean;
}) {
  const router = useRouter();
  const workspaceId = useWorkspace()?.active?.id;
  const {
    recordId,
    listPath: pathname,
    openRecord,
    closeRecord,
    recordChanged,
  } = useRecordLocation(collection.name);
  const [creating, setCreating] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [message, setMessage] = useState("");
  const {
    selected,
    setSelected,
    confirmDelete,
    setConfirmDelete,
    pending,
    select,
    selectPage,
    removeSelected,
    saveBulk,
  } = useItemSelection({
    collection,
    items,
    page,
    setMessage,
    onNavigate: navigate,
  });
  const columns = useItemColumns(collection, userId, preferences);
  const {
    root: columnRoot,
    layer: columnLayer,
    change: changeColumnVisibility,
  } = useColumnVisibilityMotion();
  const [viewEditor, setViewEditor] = useState(false);
  const { views, savingView, saveView, reloadViews } = useTableViews({
    collection,
    userId,
    workspaceId,
    page,
    setMessage,
  });
  const canRead = Boolean(collection.access.read);
  const itemKey = (item: Item) => String(item[collection.primaryKey.name]);
  const canCreate =
    Boolean(collection.access.create) &&
    (collection.mode === "multiple" || page.total === "0");

  function navigate(
    changes: Partial<ItemPage>,
    nextFilter = filter,
    nextQuery = q,
  ) {
    const href = itemsPageHref(
      pathname,
      { ...page, ...changes },
      nextQuery,
      nextFilter,
    );
    setCreating(false);
    setSelected(new Set());
    setConfirmDelete(false);
    router.push(href, { scroll: false });
  }

  function openCreate() {
    setCreating(true);
    setConfirmDelete(false);
    setMessage("");
  }

  const createButton = canCreate && (
    <Button
      type="button"
      size="sm"
      onClick={openCreate}
      disabled={pending}
    >
      <Plus aria-hidden="true" />{" "}
      {collection.mode === "single" ? "Создать объект" : "Новая запись"}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <AssistantTableContext
        context={
          canRead
            ? {
                page: "items",
                workspaceId: workspaceId ?? null,
                collection: collection.name,
                table: {
                  page: page.number,
                  size: page.size,
                  sort: page.sort,
                  direction: page.direction,
                  q,
                  filter,
                  selectedCount: selected.size,
                  editorOpen: Boolean(recordId || creating || bulkEditing),
                },
              }
            : null
        }
        onApply={(nextFilter) => navigate({ number: 1 }, nextFilter)}
      />
      <h1 className="sr-only">{collection.displayName || collection.name}</h1>
      {!collection.access.read && createButton && (
        <div className="flex justify-end">{createButton}</div>
      )}
      {message && !recordId && !creating && (
        <p
          role="status"
          className="shrink-0 rounded-lg bg-muted px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}
      {columns.error && (
        <p
          role="alert"
          className="shrink-0 text-sm text-destructive"
        >
          {columns.error}
          <Button
            size="sm"
            variant="ghost"
            onClick={columns.retry}
          >
            Повторить
          </Button>
        </p>
      )}
      {!collection.access.read ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Просмотр записей недоступен для этой коллекции.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3">
            {collection.mode === "single" && (
              <span className="text-sm text-muted-foreground">
                Коллекция с одним объектом
              </span>
            )}
            {items.length > 0 && (
              <span className="hidden text-xs text-muted-foreground lg:block">
                Нажмите на строку, чтобы открыть запись
              </span>
            )}
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
              <ItemFilters
                collection={collection}
                catalog={catalog}
                userId={userId}
                filter={filter}
                onApply={(group) =>
                  navigate({ number: 1 }, group ? JSON.stringify(group) : "")
                }
              />
              <ItemViewMenu
                all={columns.all}
                visible={columns.visible}
                saving={savingView}
                onSave={saveView}
                views={views}
                onManageViews={() => setViewEditor(true)}
                onApplyView={(view) => {
                  if (!view.definition) return;
                  columns.apply(view.definition.columns);
                  navigate(
                    {
                      number: 1,
                      size: view.definition.pageSize,
                      sort: view.definition.sort.field,
                      direction: view.definition.sort.direction,
                    },
                    view.definition.filter
                      ? JSON.stringify(view.definition.filter)
                      : "",
                    view.definition.q,
                  );
                }}
                onImport={columns.hasLegacy ? columns.importLegacy : undefined}
                onToggle={(name, show) =>
                  changeColumnVisibility(name, show, () => {
                    columns.toggle(name, show);
                    if (!show && page.sort === name)
                      navigate({
                        number: 1,
                        sort: collection.primaryKey.name,
                        direction: "asc",
                      });
                  })
                }
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
              navigate({ number: 1 }, nextFilter, nextQuery)
            }
          />
          <div
            ref={columnRoot}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-t"
          >
            {items.length === 0 ? (
              <div className="min-h-0 flex-1 overflow-auto">
                <ItemEmptyState
                  filtered={Boolean(q || filter)}
                  outOfRange={page.total !== "0"}
                  onCreate={canCreate ? openCreate : undefined}
                  onReset={() => navigate({ number: 1 }, "", "")}
                  onFirstPage={() => navigate({ number: 1 })}
                />
              </div>
            ) : (
              <ItemsTable
                collection={collection}
                catalog={catalog}
                items={items}
                recordLabels={labels}
                columns={columns.visible}
                page={page}
                selected={selected}
                disabled={pending || recordId !== null || creating}
                onSelect={select}
                onSelectPage={selectPage}
                onOpen={(item) => {
                  openRecord(itemKey(item));
                  setConfirmDelete(false);
                  setMessage("");
                }}
                onSort={(name) =>
                  navigate({
                    number: 1,
                    sort: name,
                    direction:
                      page.sort === name && page.direction === "asc"
                        ? "desc"
                        : "asc",
                  })
                }
                onMove={columns.move}
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
            <div className="shrink-0 border-t py-3 pl-4 pr-20">
              {page.total === "0" ? (
                <p className="text-sm text-muted-foreground">
                  {q || filter ? "Найдено" : "Записей"}: 0
                </p>
              ) : (
                <ItemPagination
                  page={page}
                  pathname={pathname}
                  q={q}
                  filter={filter}
                  onPage={(number) => navigate({ number })}
                  onSize={(size) => navigate({ number: 1, size })}
                />
              )}
            </div>
          )}
        </div>
      )}
      <ItemSelectionBar
        count={selected.size}
        confirming={confirmDelete}
        pending={pending}
        canDelete={collection.access.delete}
        canEdit={Boolean(collection.access.update)}
        onEdit={() => setBulkEditing(true)}
        disabled={recordId !== null || creating || bulkEditing}
        onDelete={removeSelected}
        onConfirm={() => setConfirmDelete(true)}
        onCancel={() => setConfirmDelete(false)}
        onClear={() => {
          setSelected(new Set());
          setConfirmDelete(false);
        }}
      />
      {bulkEditing && (
        <ItemBulkDialog
          collection={collection}
          catalog={catalog}
          count={selected.size}
          pending={pending}
          onClose={() => setBulkEditing(false)}
          onSave={saveBulk}
        />
      )}
      {viewEditor && (
        <TableViewDialog
          collection={collection.name}
          views={views}
          superuser={superuser}
          onClose={() => setViewEditor(false)}
          onChanged={reloadViews}
          definition={{
            columns: columns.snapshot,
            filter: filter ? readFilter(filter) : null,
            q,
            sort: { field: page.sort, direction: page.direction },
            pageSize: page.size,
          }}
        />
      )}
      {creating && (
        <ItemEditorDialog
          request={{
            collection: collection.name,
            onSaved: () => setMessage("Запись создана"),
          }}
          catalog={catalog}
          onClose={() => setCreating(false)}
        />
      )}
      {recordId !== null && (
        <ItemEditorDialog
          key={`${collection.name}:${recordId}`}
          request={{
            collection: collection.name,
            id: recordId,
            onSaved: () => setMessage("Запись обновлена"),
          }}
          catalog={catalog}
          onClose={(reason) => {
            if (reason !== "navigation") closeRecord();
          }}
          onChanged={recordChanged}
        />
      )}
    </div>
  );
}
