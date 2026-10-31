"use client";

import { useLocalizedCatalog } from "./use-localized-catalog";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { TablePreferences } from "@/lib/table-preferences";
import { itemsPageHref } from "@/lib/item-location";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { showToast } from "@/components/ui/toast";
import { ItemEmptyState } from "./item-empty-state";
import { ItemsWorkspaceToolbar } from "./items-workspace-toolbar";
import { ItemsWorkspaceDialogs } from "./items-workspace-dialogs";
import { ItemPagination } from "./item-pagination";
import { useRecordLocation } from "./use-record-location";
import { ItemsTable } from "./items-table";
import { useTableViews } from "./use-table-views";
import {
  useTableQueryPreferences,
  TablePreferencesNotice,
} from "./use-table-query-preferences";
import { useItemSelection } from "./use-item-selection";
import { useItemColumns } from "./use-item-columns";
import { useColumnVisibilityMotion } from "./use-column-visibility-motion";
import { useCollectionLive } from "./use-record-live";
import type { Collection, Item, ItemPage } from "./types";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemsWorkspace({
  collection: sourceCollection,
  catalog: sourceCatalog,
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
  const copy = useUiCopy();

  const catalog = useLocalizedCatalog(sourceCatalog);
  const collection =
    catalog.find((entry) => entry.name === sourceCollection.name) ??
    sourceCollection;
  const router = useRouter();
  const workspace = useWorkspace();
  const workspaceId = workspace?.active?.id;
  const {
    recordId,
    listPath: pathname,
    openRecord,
    closeRecord,
    recordChanged,
  } = useRecordLocation(collection.name);
  const [creating, setCreating] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);

  const setMessage = useCallback(
    (text: string, variant: "success" | "error" = "success") => {
      if (text) {
        showToast(copy(text), variant);
      }
    },
    [copy],
  );

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
  const queryPreferences = useTableQueryPreferences(
    userId,
    collection.name,
    page,
    filter,
    preferences,
  );
  const { views, reloadViews } = useTableViews({
    collection,
    userId,
    workspaceId,
    setMessage,
  });

  const canRead = Boolean(collection.access.read);
  useCollectionLive(collection.name, canRead, () => router.refresh());

  const itemKey = (item: Item) => String(item[collection.primaryKey.name]);
  const canCreate =
    !collection.profileExtension &&
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
    router.push(workspace?.href(href) ?? href, { scroll: false });
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
      {collection.mode === "single"
        ? copy("Создать объект")
        : copy("Новая запись")}
    </Button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <h1 className="sr-only">{collection.displayName || collection.name}</h1>
      <TablePreferencesNotice
        status={queryPreferences.status}
        retry={queryPreferences.retry}
      />
      {!collection.access.read && createButton && (
        <div className="flex justify-end">{createButton}</div>
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
            {copy("Повторить")}
          </Button>
        </p>
      )}
      {!collection.access.read ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {copy("Просмотр записей недоступен для этой коллекции.")}
        </div>
      ) : (
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
                  navigate({
                    number: 1,
                    sort: collection.primaryKey.name,
                    direction: "asc",
                  });
                }
              })
            }
            onManageViews={() => setViewEditor(true)}
            onNavigate={navigate}
            createButton={createButton}
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
                widths={columns.snapshot.widths ?? {}}
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
            <div className="shrink-0 border-t py-3 pl-4 pr-20">
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
                  onPage={(number) => navigate({ number })}
                  onSize={(size) => navigate({ number: 1, size })}
                />
              )}
            </div>
          )}
        </div>
      )}
      <ItemsWorkspaceDialogs
        collection={collection}
        catalog={catalog}
        sourceCatalog={sourceCatalog}
        workspaceId={workspaceId}
        canRead={canRead}
        selectedCount={selected.size}
        confirmDelete={confirmDelete}
        pending={pending}
        recordId={recordId}
        creating={creating}
        bulkEditing={bulkEditing}
        viewEditor={viewEditor}
        views={views}
        superuser={superuser}
        columnSnapshot={columns.snapshot}
        filter={filter}
        q={q}
        page={page}
        onApplyFilter={(nextFilter) => navigate({ number: 1 }, nextFilter)}
        onOpenBulkEdit={() => setBulkEditing(true)}
        onCloseBulkEdit={() => setBulkEditing(false)}
        onSaveBulk={saveBulk}
        onDeleteSelected={removeSelected}
        onConfirmDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onClearSelection={() => {
          setSelected(new Set());
          setConfirmDelete(false);
        }}
        onCloseViewEditor={() => setViewEditor(false)}
        onReloadViews={reloadViews}
        onCloseCreate={() => setCreating(false)}
        onCloseRecord={closeRecord}
        onRecordChanged={recordChanged}
        onMessage={setMessage}
      />
    </div>
  );
}
