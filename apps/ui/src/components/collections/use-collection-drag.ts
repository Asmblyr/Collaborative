"use client";

import { useState, type DragEvent } from "react";
import type { Collection, CollectionFolder } from "@/components/items/types";
import {
  canNestCollection,
  collectionLocation,
  locationValue,
  type CollectionLocation,
} from "@/lib/collection-tree";

type RowEvent = DragEvent<HTMLTableRowElement>;
type DropTarget =
  | { kind: "folder"; id: string }
  | { kind: "folder-order"; id: string; edge: "before" | "after" }
  | { kind: "row"; name: string; edge: "before" | "after" | "inside" };
export type MoveCollection = (
  name: string,
  location: CollectionLocation,
  before?: string | null,
) => void;

function edge(event: RowEvent, allowInside = false): "before" | "after" | "inside" {
  const bounds = event.currentTarget.getBoundingClientRect();
  const position = (event.clientY - bounds.top) / bounds.height;
  if (allowInside && position >= 0.25 && position <= 0.75) return "inside";
  return position < 0.5 ? "before" : "after";
}

export function useCollectionDrag({
  collections,
  folders,
  superuser,
  onMoveCollection,
  onReorderFolder,
}: {
  collections: Collection[];
  folders: CollectionFolder[];
  superuser: boolean;
  onMoveCollection: MoveCollection;
  onReorderFolder: (id: string, before: string | null) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [draggedFolder, setDraggedFolder] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const canDrop = () => superuser && Boolean(dragged);
  const reset = () => {
    setDragged(null);
    setDraggedFolder(null);
    setDropTarget(null);
  };

  function rowDestination(event: RowEvent, collection: Collection) {
    if (!canDrop() || !dragged || dragged === collection.name || !collection.access.structure)
      return null;
    const position = edge(event, true);
    const location =
      position === "inside"
        ? { folderId: null, parentCollection: collection.name }
        : collectionLocation(collection);
    if (
      location.parentCollection &&
      !canNestCollection(dragged, location.parentCollection, collections)
    )
      return null;
    const siblings = collections.filter(
      (c) => c.name !== dragged && locationValue(collectionLocation(c)) === locationValue(location),
    );
    const index = siblings.findIndex((c) => c.name === collection.name);
    return {
      location,
      edge: position,
      before:
        position === "inside"
          ? null
          : position === "before"
            ? collection.name
            : (siblings[index + 1]?.name ?? null),
    };
  }

  function dragOverFolder(event: RowEvent, folderId: string | null) {
    if (draggedFolder) {
      if (!folderId || draggedFolder === folderId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget({
        kind: "folder-order",
        id: folderId,
        edge: edge(event) as "before" | "after",
      });
    } else if (canDrop()) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTarget({ kind: "folder", id: folderId ?? "root" });
    }
  }

  function dropOnFolder(event: RowEvent, folderId: string | null) {
    if (draggedFolder) {
      if (!folderId || draggedFolder === folderId) return;
      event.preventDefault();
      const siblings = folders.filter((folder) => folder.id !== draggedFolder);
      const index = siblings.findIndex((folder) => folder.id === folderId);
      onReorderFolder(
        draggedFolder,
        edge(event) === "before" ? folderId : (siblings[index + 1]?.id ?? null),
      );
    } else if (canDrop() && dragged) {
      event.preventDefault();
      onMoveCollection(dragged, { folderId, parentCollection: null }, null);
    }
    reset();
  }

  function dragOverRow(event: RowEvent, collection: Collection) {
    const destination = rowDestination(event, collection);
    if (!destination) {
      setDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ kind: "row", name: collection.name, edge: destination.edge });
  }

  function dropOnRow(event: RowEvent, collection: Collection) {
    const destination = rowDestination(event, collection);
    if (!destination || !dragged) return;
    event.preventDefault();
    onMoveCollection(dragged, destination.location, destination.before);
    reset();
  }

  return {
    dragged,
    setDragged,
    draggedFolder,
    setDraggedFolder,
    dropTarget,
    setDropTarget,
    canDrop,
    dragOverFolder,
    dropOnFolder,
    dragOverRow,
    dropOnRow,
  };
}
