"use client";

import { useLocalizedCatalog } from "./use-localized-catalog";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { TablePreferences } from "@/lib/table-preferences";
import { itemsPageHref } from "@/lib/item-location";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { showToast } from "@/components/ui/toast";
import { ItemsWorkspaceCard } from "./items-workspace-card";
import { ItemsWorkspaceDialogs } from "./items-workspace-dialogs";
import type { PreloadedRecordSnapshot } from "./record-editor-types";
import { useRecordLocation } from "./use-record-location";
import { useTableViews } from "./use-table-views";
import {
  useCanonicalTableQuery,
  useTableQueryPreferences,
  TablePreferencesNotice,
} from "./use-table-query-preferences";
import { useItemSelection } from "./use-item-selection";
import { useItemColumns } from "./use-item-columns";
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
  initialRelationLabels,
  initialRecord = null,
  page,
  q,
  filter,
  preferences,
  canonicalQuery = null,
}: {
  collection: Collection;
  catalog: Collection[];
  userId: string;
  items: Item[];
  page: ItemPage;
  q: string;
  filter: string;
  labels?: Record<string, string>;
  initialRelationLabels?: Record<string, string>;
  initialRecord?: PreloadedRecordSnapshot | null;
  preferences: TablePreferences | null;
  superuser: boolean;
  canonicalQuery?: string | null;
}) {
  const copy = useUiCopy();

  const catalog = useLocalizedCatalog(sourceCatalog);
  const collection =
    catalog.find((entry) => entry.name === sourceCollection.name) ??
    sourceCollection;
  const router = useRouter();
  const [navigating, startTransition] = useTransition();
  const workspace = useWorkspace();
  const workspaceId = workspace?.active?.id;
  const {
    recordId,
    listPath: pathname,
    openRecord,
    closeRecord,
    recordChanged,
  } = useRecordLocation(collection.name);
  const [ssrInitialRecord, setSsrInitialRecord] = useState(initialRecord);
  if (ssrInitialRecord && recordId !== ssrInitialRecord.id) {
    setSsrInitialRecord(null);
  }
  const [creating, setCreating] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);

  useCanonicalTableQuery(canonicalQuery);

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
  const deferLiveRefresh =
    creating ||
    bulkEditing ||
    viewEditor ||
    recordId !== null ||
    selected.size > 0;
  useCollectionLive(
    collection.name,
    canRead,
    () => {
      startTransition(() => {
        router.refresh();
      });
    },
    deferLiveRefresh,
  );

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
    startTransition(() => {
      router.push(workspace?.href(href) ?? href, { scroll: false });
    });
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
        <ItemsWorkspaceCard
          collection={collection}
          catalog={catalog}
          userId={userId}
          items={items}
          labels={labels}
          initialRelationLabels={initialRelationLabels}
          page={page}
          pathname={pathname}
          q={q}
          filter={filter}
          columns={columns}
          views={views}
          selected={selected}
          disabled={pending || recordId !== null || creating}
          navigating={navigating}
          canCreate={canCreate}
          createButton={createButton}
          onManageViews={() => setViewEditor(true)}
          onNavigate={navigate}
          onOpenCreate={openCreate}
          onSelect={select}
          onSelectPage={selectPage}
          onOpenRecord={(item) => {
            openRecord(itemKey(item));
            setConfirmDelete(false);
            setMessage("");
          }}
        />
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
        initialRecord={ssrInitialRecord}
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
