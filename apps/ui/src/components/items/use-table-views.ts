"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-request";
import type { Collection } from "./types";
import type { TableView } from "./table-view-dialog";
import { useUiCopy } from "@/lib/ui-copy";
import { workspaceViewQuery } from "@/lib/workspace-location";

export function useTableViews({
  collection,
  userId,
  workspaceId,
  setMessage,
}: {
  collection: Collection;
  userId: string;
  workspaceId?: string;
  setMessage: (message: string, variant?: "success" | "error") => void;
}) {
  const copy = useUiCopy();

  const [views, setViews] = useState<TableView[]>([]);
  const viewEndpoint = `/api/table-views/${encodeURIComponent(collection.name)}${workspaceViewQuery(workspaceId ?? "all")}`;
  const canRead = Boolean(collection.access.read);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    void apiRequest<TableView[]>(viewEndpoint)
      .then((rows) => {
        if (active) setViews(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [viewEndpoint, canRead, userId, workspaceId]);

  function reloadViews() {
    void apiRequest<TableView[]>(viewEndpoint)
      .then(setViews)
      .catch(() =>
        setMessage(copy("Не удалось обновить список видов"), "error"),
      );
  }
  return { views, reloadViews };
}
