"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Ellipsis,
  Folder,
  GripVertical,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Collection, CollectionFolder } from "@/components/items/types";
import type { useCollectionDrag } from "./use-collection-drag";
import { useUiCopy } from "@/lib/ui-copy";
import { useMenuEditorAction } from "./use-menu-editor-action";

export function FolderTableRow({
  folder,
  folders,
  collections,
  superuser,
  collapsed,
  onToggle,
  drag,
  onReorderFolder,
  onCreateInFolder,
  onEditFolder,
}: {
  folder: CollectionFolder;
  folders: CollectionFolder[];
  collections: Collection[];
  superuser: boolean;
  collapsed: boolean;
  onToggle: () => void;
  drag: ReturnType<typeof useCollectionDrag>;
  onReorderFolder: (id: string, before: string | null) => void;
  onCreateInFolder: (id: string) => void;
  onEditFolder: (folder: CollectionFolder) => void;
}) {
  const copy = useUiCopy();
  const {
    triggerRef,
    select: selectEditorAction,
    onCloseAutoFocus,
  } = useMenuEditorAction();
  const {
    dropTarget,
    draggedFolder,
    canDrop,
    setDraggedFolder,
    setDragged,
    setDropTarget,
    dragOverFolder,
    dropOnFolder,
  } = drag;
  const folderIndex = folders.findIndex((entry) => entry.id === folder.id);
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
      draggable={superuser}
      title={
        superuser
          ? copy("Перетащите папку {{value0}} выше или ниже другой папки", {
              value0: folder.name,
            })
          : undefined
      }
      className={`${
        dropTarget?.kind === "folder" && dropTarget.id === folder.id
          ? "bg-primary/15 outline-2 -outline-offset-2 outline-primary "
          : "bg-muted/35 hover:bg-muted/45 "
      }${superuser ? "cursor-grab active:cursor-grabbing " : ""}${
        draggedFolder === folder.id ? "opacity-50 " : ""
      }${before ? "[&>td]:border-t-2 [&>td]:border-primary bg-primary/5 " : ""}${
        after ? "[&>td]:border-b-2 [&>td]:border-primary bg-primary/5" : ""
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
        colSpan={4}
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
            onClick={onToggle}
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
            <span className="text-muted-foreground tabular-nums">{count}</span>
          </Button>
          {canDrop() && (
            <span className="text-xs text-primary">
              {copy("В конец папки ")}
            </span>
          )}
          {(before || after) && (
            <span className="text-xs text-primary">
              {before ? copy("Перед папкой") : copy("После папки")}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="sticky right-0 z-10 bg-card pr-3 shadow-[-1px_0_0_0_var(--border)]">
        {superuser && (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={folderIndex === 0}
              aria-label={copy("Поднять папку {{value0}}", {
                value0: folder.name,
              })}
              onClick={() =>
                onReorderFolder(folder.id, folders[folderIndex - 1].id)
              }
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={folderIndex === folders.length - 1}
              aria-label={copy("Опустить папку {{value0}}", {
                value0: folder.name,
              })}
              onClick={() =>
                onReorderFolder(folder.id, folders[folderIndex + 2]?.id ?? null)
              }
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={triggerRef}
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={copy("Действия папки {{value0}}", {
                    value0: folder.name,
                  })}
                >
                  <Ellipsis aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={onCloseAutoFocus}
              >
                <DropdownMenuItem
                  onSelect={() =>
                    selectEditorAction(() => onCreateInFolder(folder.id))
                  }
                >
                  {copy("Создать коллекцию ")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    selectEditorAction(() => onEditFolder(folder))
                  }
                >
                  {copy("Настроить ")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
