"use client";

import Link from "next/link";
import { Ellipsis, ArrowUpRight } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Collection, CollectionFolder } from "@/components/items/types";
import { collectionLocation } from "@/lib/collection-tree";
import { CollectionLocationSelect } from "./collection-location-select";
import type { MoveCollection } from "./use-collection-drag";
import { useMenuEditorAction } from "./use-menu-editor-action";
import { useUiCopy } from "@/lib/ui-copy";

export interface CollectionActions {
  onForm: (collection: string) => void;
  onDisplay: (collection: string) => void;
  onAddField: (collection: string) => void;
  onDeleteCollection: (collection: string) => void;
  onMoveCollection: MoveCollection;
}

export function CollectionRowActions({
  collection,
  catalog,
  folders,
  canEdit,
  canOpenItems,
  actions,
}: {
  collection: Collection;
  catalog: Collection[];
  folders: CollectionFolder[];
  canEdit: boolean;
  canOpenItems: boolean;
  actions: CollectionActions;
}) {
  const copy = useUiCopy();
  const {
    triggerRef,
    select: selectEditorAction,
    onCloseAutoFocus,
  } = useMenuEditorAction();
  const {
    onForm,
    onDisplay,
    onAddField,
    onDeleteCollection,
    onMoveCollection,
  } = actions;
  return (
    <div className="flex justify-end gap-1">
      {canEdit && (
        <CollectionLocationSelect
          compact
          name={collection.name}
          location={collectionLocation(collection)}
          collections={catalog.filter((entry) => entry.access.structure)}
          folders={folders}
          onChange={(location) => onMoveCollection(collection.name, location)}
        />
      )}
      {canOpenItems && (
        <Button
          asChild
          size="icon-sm"
          variant="ghost"
        >
          <Link
            href={`/items/${encodeURIComponent(collection.name)}`}
            aria-label={copy("Открыть записи {{value0}}", {
              value0: collection.name,
            })}
            title={copy("Записи ")}
          >
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={copy("Действия коллекции {{value0}}", {
                value0: collection.name,
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
                selectEditorAction(() => onDisplay(collection.name))
              }
            >
              {copy("Настройки коллекции ")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => selectEditorAction(() => onForm(collection.name))}
            >
              {copy("Форма ")}
            </DropdownMenuItem>
            {collection.sourceKind !== "materialized-view" && (
              <DropdownMenuItem
                onSelect={() =>
                  selectEditorAction(() => onAddField(collection.name))
                }
              >
                {copy("Добавить поле ")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() =>
                selectEditorAction(() => onDeleteCollection(collection.name))
              }
            >
              {copy(
                collection.sourceKind === "materialized-view"
                  ? "Отключить"
                  : "Удалить ",
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
