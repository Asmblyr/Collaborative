"use client";

import { Fragment } from "react";
import { ChevronRight, GripVertical, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { cn } from "@/lib/utils";
import { CollectionFields } from "./collection-fields";
import type { useCollectionDrag } from "./use-collection-drag";
import { useUiCopy } from "@/lib/ui-copy";
import {
  CollectionRowActions as CollectionActionsCell,
  type CollectionActions,
} from "./collection-row-actions";

interface CollectionRowActions extends CollectionActions {
  onEditField: (collection: string, field: string) => void;
  onDeleteField: (collection: string, field: string) => void;
}

export function CollectionTableRow({
  collection,
  depth,
  childCount,
  catalog,
  folders,
  superuser,
  isExpanded,
  childrenCollapsed,
  onToggleExpanded,
  onToggleChildren,
  drag,
  actions,
}: {
  collection: Collection;
  depth: number;
  childCount: number;
  catalog: Collection[];
  folders: CollectionFolder[];
  superuser: boolean;
  isExpanded: boolean;
  childrenCollapsed: boolean;
  onToggleExpanded: () => void;
  onToggleChildren: () => void;
  drag: ReturnType<typeof useCollectionDrag>;
  actions: CollectionRowActions;
}) {
  const copy = useUiCopy();

  const {
    dragged,
    setDragged,
    setDraggedFolder,
    dropTarget,
    setDropTarget,
    dragOverRow,
    dropOnRow,
  } = drag;
  const { onForm, onDisplay, onAddField, onEditField, onDeleteField } = actions;
  const canEdit = superuser && collection.access.structure;
  const inside =
    dropTarget?.kind === "row" &&
    dropTarget.name === collection.name &&
    dropTarget.edge === "inside";
  const fieldCount =
    1 +
    collection.fields.length +
    Number(collection.timestamps.createdAt) +
    Number(collection.timestamps.updatedAt);
  const canOpenItems = Boolean(
    collection.access.read ||
      collection.access.create ||
      collection.access.update,
  );
  const before =
    dropTarget?.kind === "row" &&
    dropTarget.name === collection.name &&
    dropTarget.edge === "before";
  const after =
    dropTarget?.kind === "row" &&
    dropTarget.name === collection.name &&
    dropTarget.edge === "after";
  return (
    <Fragment key={collection.name}>
      <TableRow
        draggable={canEdit}
        title={
          canEdit
            ? copy(
                "Перетащите {{value0}} в центр коллекции для вложения, к краю для сортировки",
                { value0: collection.name },
              )
            : undefined
        }
        className={cn(
          inside && "bg-primary/15 outline-2 -outline-offset-2 outline-primary",
          !inside && isExpanded && "bg-muted/30",
          canEdit && "cursor-grab active:cursor-grabbing",
          dragged === collection.name && "opacity-50",
          before && "[&>td]:border-t-2 [&>td]:border-primary bg-primary/5",
          after && "[&>td]:border-b-2 [&>td]:border-primary bg-primary/5",
        )}
        onDragStart={(event) => {
          if (!canEdit) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", collection.name);
          setDragged(collection.name);
          setDraggedFolder(null);
        }}
        onDragOver={(event) => dragOverRow(event, collection)}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(event) => dropOnRow(event, collection)}
        onDragEnd={() => {
          setDragged(null);
          setDropTarget(null);
        }}
      >
        <TableCell style={{ paddingLeft: 12 + depth * 20 }}>
          <div className="flex min-w-0 items-center">
            {canEdit && (
              <GripVertical
                aria-hidden="true"
                className="mr-1 size-4 shrink-0 text-muted-foreground"
              />
            )}
            {childCount > 0 ? (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={copy("Вложенные коллекции {{value0}}", {
                  value0: collection.name,
                })}
                aria-expanded={!childrenCollapsed}
                onClick={onToggleChildren}
              >
                <ChevronRight
                  className={childrenCollapsed ? "size-4" : "size-4 rotate-90"}
                />
              </Button>
            ) : (
              <span
                className="size-7 shrink-0"
                aria-hidden="true"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 justify-start gap-2 font-mono font-medium"
              title={collection.name}
              aria-expanded={isExpanded}
              aria-controls={
                isExpanded ? `collection-fields-${collection.name}` : undefined
              }
              onClick={onToggleExpanded}
            >
              <Table2 aria-hidden="true" />
              <span className="truncate">
                {collection.displayName || collection.name}
              </span>
              {collection.hidden && (
                <Badge
                  variant="outline"
                  className="font-sans font-normal text-muted-foreground"
                >
                  {copy("Скрыта ")}
                </Badge>
              )}
            </Button>
            {inside && (
              <span className="ml-2 shrink-0 text-xs text-primary">
                {copy("Вложить сюда ")}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {collection.sourceKind === "materialized-view"
              ? copy("Представление")
              : collection.mode === "single"
                ? copy("Один объект")
                : copy("Много записей")}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs">
          {collection.primaryKey.name}{" "}
          <span className="text-muted-foreground">
            · {collection.primaryKey.type}
          </span>
        </TableCell>
        <TableCell className="tabular-nums">{fieldCount}</TableCell>
        <TableCell className="sticky right-0 z-10 bg-card pr-3 text-right shadow-[-1px_0_0_0_var(--border)]">
          <CollectionActionsCell
            collection={collection}
            catalog={catalog}
            folders={folders}
            canEdit={canEdit}
            canOpenItems={canOpenItems}
            actions={actions}
          />
        </TableCell>
      </TableRow>
      {isExpanded && (
        <TableRow
          id={`collection-fields-${collection.name}`}
          className="hover:bg-transparent"
        >
          <TableCell
            colSpan={5}
            className="bg-muted/20 p-0 whitespace-normal"
          >
            <CollectionFields
              collection={collection}
              superuser={superuser}
              onForm={() => onForm(collection.name)}
              onDisplay={() => onDisplay(collection.name)}
              onAddField={() => onAddField(collection.name)}
              onEditField={(field) => onEditField(collection.name, field)}
              onDeleteField={(field) => onDeleteField(collection.name, field)}
            />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}
