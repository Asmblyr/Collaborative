"use client";

import type { ColumnPreferences } from "@/lib/table-preferences";
import { AssistantTableContext } from "@/components/assistant/assistant-context";
import { ItemEditorDialog } from "./item-editor-dialog";
import { ItemBulkDialog } from "./item-bulk-dialog";
import { ItemSelectionBar } from "./item-selection-bar";
import { TableViewDialog, type TableView } from "./table-view-dialog";
import { readFilter } from "./item-filter-options";
import type { Collection, ItemPage, ItemValue } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemsWorkspaceDialogs({
  collection,
  catalog,
  sourceCatalog,
  workspaceId,
  canRead,
  selectedCount,
  confirmDelete,
  pending,
  recordId,
  creating,
  bulkEditing,
  viewEditor,
  views,
  superuser,
  columnSnapshot,
  filter,
  q,
  page,
  onApplyFilter,
  onOpenBulkEdit,
  onCloseBulkEdit,
  onSaveBulk,
  onDeleteSelected,
  onConfirmDelete,
  onCancelDelete,
  onClearSelection,
  onCloseViewEditor,
  onReloadViews,
  onCloseCreate,
  onCloseRecord,
  onRecordChanged,
  onMessage,
}: {
  collection: Collection;
  catalog: Collection[];
  sourceCatalog: Collection[];
  workspaceId?: string;
  canRead: boolean;
  selectedCount: number;
  confirmDelete: boolean;
  pending: boolean;
  recordId: string | null;
  creating: boolean;
  bulkEditing: boolean;
  viewEditor: boolean;
  views: TableView[];
  superuser: boolean;
  columnSnapshot: ColumnPreferences;
  filter: string;
  q: string;
  page: ItemPage;
  onApplyFilter: (filter: string) => void;
  onOpenBulkEdit: () => void;
  onCloseBulkEdit: () => void;
  onSaveBulk: (
    values: Record<string, ItemValue>,
    close: () => void,
  ) => Promise<void>;
  onDeleteSelected: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClearSelection: () => void;
  onCloseViewEditor: () => void;
  onReloadViews: () => void;
  onCloseCreate: () => void;
  onCloseRecord: () => void;
  onRecordChanged: () => void;
  onMessage: (text: string, variant?: "success" | "error") => void;
}) {
  const copy = useUiCopy();

  return (
    <>
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
                  order: page.order ?? "field",
                  direction: page.direction,
                  q,
                  filter,
                  selectedCount,
                  editorOpen: Boolean(recordId || creating || bulkEditing),
                },
              }
            : null
        }
        onApply={onApplyFilter}
      />
      <ItemSelectionBar
        count={selectedCount}
        confirming={confirmDelete}
        pending={pending}
        canDelete={collection.access.delete}
        canEdit={Boolean(collection.access.update)}
        onEdit={onOpenBulkEdit}
        disabled={recordId !== null || creating || bulkEditing}
        onDelete={onDeleteSelected}
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        onClear={onClearSelection}
      />
      {bulkEditing && (
        <ItemBulkDialog
          collection={collection}
          catalog={catalog}
          count={selectedCount}
          pending={pending}
          onClose={onCloseBulkEdit}
          onSave={onSaveBulk}
        />
      )}
      {viewEditor && (
        <TableViewDialog
          collection={collection.name}
          views={views}
          superuser={superuser}
          onClose={onCloseViewEditor}
          onChanged={onReloadViews}
          definition={{
            columns: columnSnapshot,
            filter: filter ? readFilter(filter) : null,
            q,
            sort: {
              field: page.sort,
              direction: page.direction,
              order: page.order ?? "field",
            },
            pageSize: page.size,
          }}
        />
      )}
      {creating && (
        <ItemEditorDialog
          request={{
            collection: collection.name,
            onSaved: () => onMessage(copy("Запись создана")),
          }}
          catalog={catalog}
          onClose={onCloseCreate}
        />
      )}
      {recordId !== null && (
        <ItemEditorDialog
          key={`${collection.name}:${recordId}`}
          request={{
            collection: collection.name,
            id: recordId,
            onSaved: () => onMessage(copy("Запись обновлена")),
          }}
          catalog={
            collection.sourceKind === "materialized-view"
              ? sourceCatalog
              : catalog
          }
          onClose={(reason) => {
            if (reason !== "navigation") {
              onCloseRecord();
            }
          }}
          onChanged={onRecordChanged}
        />
      )}
    </>
  );
}
