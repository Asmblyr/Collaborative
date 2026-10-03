"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-request";
import type { Collection, ItemPage } from "./types";
import type { TableView } from "./table-view-dialog";

export function useTableViews({
  collection,
  userId,
  workspaceId,
  page,
  setMessage,
}: {
  collection: Collection;
  userId: string;
  workspaceId?: string;
  page: ItemPage;
  setMessage: (message: string) => void;
}) {
  const [savingView, setSavingView] = useState(false);
  const [views, setViews] = useState<TableView[]>([]);
  const viewEndpoint = `/api/table-views/${encodeURIComponent(collection.name)}`;
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

  async function saveView() {
    setSavingView(true);
    setMessage("");
    try {
      await apiRequest(
        `/api/users/me/table-preferences/${encodeURIComponent(collection.name)}`,
        "PATCH",
        {
          pageSize: page.size,
          sort: { field: page.sort, direction: page.direction },
        },
      );
      setMessage("Текущий вид сохранён в вашем профиле");
    } catch {
      setMessage("Не удалось сохранить вид таблицы");
    } finally {
      setSavingView(false);
    }
  }

  function reloadViews() {
    void apiRequest<TableView[]>(viewEndpoint)
      .then(setViews)
      .catch(() => setMessage("Не удалось обновить список видов"));
  }
  return { views, savingView, saveView, reloadViews };
}
