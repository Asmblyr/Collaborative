"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight, GripVertical, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { collectionLocation } from "@/lib/collection-tree";
import { cn } from "@/lib/utils";
import { CollectionFields } from "./collection-fields";
import { CollectionLocationSelect } from "./collection-location-select";
import type { useCollectionDrag, MoveCollection } from "./use-collection-drag";

interface CollectionRowActions {
  onForm: (collection: string) => void;
  onDisplay: (collection: string) => void;
  onAddField: (collection: string) => void;
  onEditField: (collection: string, field: string) => void;
  onDeleteField: (collection: string, field: string) => void;
  onDeleteCollection: (collection: string) => void;
  onMoveCollection: MoveCollection;
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
  const {
    dragged,
    setDragged,
    setDraggedFolder,
    dropTarget,
    setDropTarget,
    dragOverRow,
    dropOnRow,
  } = drag;
  const {
    onForm,
    onDisplay,
    onAddField,
    onEditField,
    onDeleteField,
    onDeleteCollection,
    onMoveCollection,
  } = actions;
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
  const canOpenItems =
    collection.access.read ||
    collection.access.create ||
    collection.access.update;
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
            ? `Перетащите ${collection.name} в центр коллекции для вложения, к краю для сортировки`
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
          <div className="flex items-center">
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
                aria-label={`Вложенные коллекции ${collection.name}`}
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
              className="max-w-full justify-start gap-2 font-mono font-medium"
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
              {collection.displayName && (
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {collection.name}
                </span>
              )}
              {collection.hidden && (
                <Badge
                  variant="outline"
                  className="font-sans font-normal text-muted-foreground"
                >
                  Скрыта
                </Badge>
              )}
            </Button>
            {inside && (
              <span className="ml-2 shrink-0 text-xs text-primary">
                Вложить сюда
              </span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="secondary">
            {collection.mode === "single" ? "Один объект" : "Много записей"}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs">
          {collection.primaryKey.name}{" "}
          <span className="text-muted-foreground">
            · {collection.primaryKey.type}
          </span>
        </TableCell>
        <TableCell className="tabular-nums">{fieldCount}</TableCell>
        <TableCell className="pr-4 text-right">
          <div className="flex justify-end gap-1">
            {canEdit && (
              <CollectionLocationSelect
                compact
                name={collection.name}
                location={collectionLocation(collection)}
                collections={catalog.filter((entry) => entry.access.structure)}
                folders={folders}
                onChange={(location) =>
                  onMoveCollection(collection.name, location)
                }
              />
            )}
            {canOpenItems && (
              <Button
                asChild
                size="sm"
                variant="ghost"
              >
                <Link href={`/items/${encodeURIComponent(collection.name)}`}>
                  Записи
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Удалить коллекцию ${collection.name}`}
                className="text-destructive hover:text-destructive"
                onClick={() => onDeleteCollection(collection.name)}
              >
                Удалить
              </Button>
            )}
          </div>
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
