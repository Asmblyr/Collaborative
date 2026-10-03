"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Folder,
  GripVertical,
} from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { useCollectionDrag, type MoveCollection } from "./use-collection-drag";
import { collectionTree, type CollectionNode } from "@/lib/collection-tree";
import { CollectionTableRow } from "./collection-table-row";

export function CollectionsTable({
  collections,
  catalog,
  folders,
  superuser,
  onForm,
  onDisplay,
  onAddField,
  onEditField,
  onDeleteField,
  onDeleteCollection,
  onEditFolder,
  onCreateInFolder,
  onMoveCollection,
  onReorderFolder,
}: {
  collections: Collection[];
  catalog: Collection[];
  folders: CollectionFolder[];
  superuser: boolean;
  onForm: (collection: string) => void;
  onDisplay: (collection: string) => void;
  onAddField: (collection: string) => void;
  onEditField: (collection: string, field: string) => void;
  onDeleteField: (collection: string, field: string) => void;
  onDeleteCollection: (collection: string) => void;
  onEditFolder: (folder: CollectionFolder) => void;
  onCreateInFolder: (folderId: string) => void;
  onMoveCollection: MoveCollection;
  onReorderFolder: (folderId: string, before: string | null) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const [collapsedCollections, setCollapsedCollections] = useState<string[]>(
    [],
  );
  const drag = useCollectionDrag({
    collections: catalog,
    folders,
    superuser,
    onMoveCollection,
    onReorderFolder,
  });
  const {
    setDragged,
    draggedFolder,
    setDraggedFolder,
    dropTarget,
    setDropTarget,
    canDrop,
    dragOverFolder,
    dropOnFolder,
  } = drag;
  const tree = collectionTree(collections);
  const rootCollections = tree.filter(
    ({ collection }) =>
      !collection.folderId ||
      !folders.some((folder) => folder.id === collection.folderId),
  );
  function treeRows(
    nodes: CollectionNode<Collection>[],
    depth: number,
  ): {
    kind: "collection";
    collection: Collection;
    depth: number;
    childCount: number;
  }[] {
    return nodes.flatMap(({ collection, children }) => [
      {
        kind: "collection" as const,
        collection,
        depth,
        childCount: children.length,
      },
      ...(!collapsedCollections.includes(collection.name)
        ? treeRows(children, depth + 1)
        : []),
    ]);
  }
  const rows = [
    ...folders.flatMap((folder) => [
      { kind: "folder" as const, folder },
      ...(!collapsedFolders.includes(folder.id)
        ? treeRows(
            tree.filter(({ collection }) => collection.folderId === folder.id),
            1,
          )
        : []),
    ]),
    { kind: "root" as const },
    ...treeRows(rootCollections, 0),
  ];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table
        aria-label="Коллекции"
        className="min-w-[54rem]"
      >
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[30%] pl-4">Коллекция</TableHead>
            <TableHead className="w-[16%]">Режим</TableHead>
            <TableHead className="w-[24%]">Основной ключ</TableHead>
            <TableHead className="w-[8%]">Поля</TableHead>
            <TableHead className="pr-4 text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.kind === "folder") {
              const { folder } = row;
              const folderIndex = folders.findIndex(
                (entry) => entry.id === folder.id,
              );
              const collapsed = collapsedFolders.includes(folder.id);
              const count = collections.filter(
                (collection) => collection.folderId === folder.id,
              ).length;
              const before =
                dropTarget?.kind === "folder-order" &&
                dropTarget.id === folder.id &&
                dropTarget.edge === "before";
              const after =
                dropTarget?.kind === "folder-order" &&
                dropTarget.id === folder.id &&
                dropTarget.edge === "after";
              return (
                <TableRow
                  key={`folder:${folder.id}`}
                  draggable={superuser}
                  title={
                    superuser
                      ? `Перетащите папку ${folder.name} выше или ниже другой папки`
                      : undefined
                  }
                  className={`${
                    dropTarget?.kind === "folder" && dropTarget.id === folder.id
                      ? "bg-primary/15 outline-2 -outline-offset-2 outline-primary "
                      : "bg-muted/35 hover:bg-muted/45 "
                  }${superuser ? "cursor-grab active:cursor-grabbing " : ""}${
                    draggedFolder === folder.id ? "opacity-50 " : ""
                  }${before ? "[&>td]:border-t-2 [&>td]:border-primary bg-primary/5 " : ""}${
                    after
                      ? "[&>td]:border-b-2 [&>td]:border-primary bg-primary/5"
                      : ""
                  }`}
                  onDragStart={(event) => {
                    if (!superuser) return;
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", folder.name);
                    setDraggedFolder(folder.id);
                    setDragged(null);
                  }}
                  onDragOver={(event) => dragOverFolder(event, folder.id)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => dropOnFolder(event, folder.id)}
                  onDragEnd={() => {
                    setDraggedFolder(null);
                    setDropTarget(null);
                  }}
                >
                  <TableCell
                    colSpan={5}
                    className="px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {superuser && (
                        <GripVertical
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-w-0 gap-2 font-medium"
                        aria-expanded={!collapsed}
                        onClick={() =>
                          setCollapsedFolders(
                            collapsed
                              ? collapsedFolders.filter(
                                  (id) => id !== folder.id,
                                )
                              : [...collapsedFolders, folder.id],
                          )
                        }
                      >
                        <ChevronRight
                          className={collapsed ? "size-4" : "size-4 rotate-90"}
                          aria-hidden="true"
                        />
                        <Folder
                          className="size-4"
                          aria-hidden="true"
                        />
                        <span className="truncate">{folder.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {count}
                        </span>
                      </Button>
                      {canDrop() && (
                        <span className="text-xs text-primary">
                          В конец папки
                        </span>
                      )}
                      {(before || after) && (
                        <span className="text-xs text-primary">
                          {before ? "Перед папкой" : "После папки"}
                        </span>
                      )}
                      {superuser && (
                        <div className="ml-auto flex gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={folderIndex === 0}
                            aria-label={`Поднять папку ${folder.name}`}
                            onClick={() =>
                              onReorderFolder(
                                folder.id,
                                folders[folderIndex - 1].id,
                              )
                            }
                          >
                            <ArrowUp aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={folderIndex === folders.length - 1}
                            aria-label={`Опустить папку ${folder.name}`}
                            onClick={() =>
                              onReorderFolder(
                                folder.id,
                                folders[folderIndex + 2]?.id ?? null,
                              )
                            }
                          >
                            <ArrowDown aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onCreateInFolder(folder.id)}
                          >
                            Коллекция
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => onEditFolder(folder)}
                          >
                            Настроить
                          </Button>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }
            if (row.kind === "root") {
              return (
                <TableRow
                  key="root"
                  className={
                    dropTarget?.kind === "folder" && dropTarget.id === "root"
                      ? "bg-primary/15 outline-2 -outline-offset-2 outline-primary"
                      : "bg-muted/25 hover:bg-muted/35"
                  }
                  onDragOver={(event) => dragOverFolder(event, null)}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(event) => dropOnFolder(event, null)}
                >
                  <TableCell
                    colSpan={5}
                    className="px-5 py-3 text-sm font-medium"
                  >
                    В корне{" "}
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {rootCollections.length}
                    </span>
                    {canDrop() && (
                      <span className="ml-3 text-xs font-normal text-primary">
                        В конец списка
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            }
            const { collection, depth, childCount } = row;
            const childrenCollapsed = collapsedCollections.includes(
              collection.name,
            );
            const isExpanded = expanded === collection.name;
            return (
              <CollectionTableRow
                key={collection.name}
                collection={collection}
                depth={depth}
                childCount={childCount}
                catalog={catalog}
                folders={folders}
                superuser={superuser}
                isExpanded={isExpanded}
                childrenCollapsed={childrenCollapsed}
                onToggleExpanded={() =>
                  setExpanded(isExpanded ? null : collection.name)
                }
                onToggleChildren={() =>
                  setCollapsedCollections(
                    childrenCollapsed
                      ? collapsedCollections.filter(
                          (name) => name !== collection.name,
                        )
                      : [...collapsedCollections, collection.name],
                  )
                }
                drag={drag}
                actions={{
                  onForm,
                  onDisplay,
                  onAddField,
                  onEditField,
                  onDeleteField,
                  onDeleteCollection,
                  onMoveCollection,
                }}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
