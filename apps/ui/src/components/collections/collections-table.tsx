"use client";

import { useState } from "react";
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
import { FolderTableRow } from "./folder-table-row";
import { CollectionTableRow } from "./collection-table-row";
import { useUiCopy } from "@/lib/ui-copy";

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
  const copy = useUiCopy();

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
  const { dropTarget, setDropTarget, canDrop, dragOverFolder, dropOnFolder } =
    drag;
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
        aria-label={copy("Коллекции")}
        className="min-w-[42rem] table-fixed"
      >
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">{copy("Коллекция")}</TableHead>
            <TableHead className="w-32">{copy("Режим")}</TableHead>
            <TableHead className="w-40">{copy("Основной ключ")}</TableHead>
            <TableHead className="w-14">{copy("Поля")}</TableHead>
            <TableHead className="sticky right-0 z-10 w-28 bg-card pr-3 text-right shadow-[-1px_0_0_0_var(--border)]">
              {copy("Действия")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            if (row.kind === "folder") {
              const collapsed = collapsedFolders.includes(row.folder.id);
              return (
                <FolderTableRow
                  key={`folder:${row.folder.id}`}
                  folder={row.folder}
                  folders={folders}
                  collections={collections}
                  superuser={superuser}
                  collapsed={collapsed}
                  drag={drag}
                  onToggle={() =>
                    setCollapsedFolders(
                      collapsed
                        ? collapsedFolders.filter((id) => id !== row.folder.id)
                        : [...collapsedFolders, row.folder.id],
                    )
                  }
                  onReorderFolder={onReorderFolder}
                  onCreateInFolder={onCreateInFolder}
                  onEditFolder={onEditFolder}
                />
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
                    {copy("Без папки")}{" "}
                    <span className="ml-2 text-muted-foreground tabular-nums">
                      {rootCollections.length}
                    </span>
                    {canDrop() && (
                      <span className="ml-3 text-xs font-normal text-primary">
                        {copy("В конец списка ")}
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
