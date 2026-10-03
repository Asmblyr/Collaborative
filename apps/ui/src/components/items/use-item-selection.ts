"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import { asmblyr } from "@/lib/asmblyr";
import { ApiError } from "@asmblyr/sdk";
import type { Collection, Item, ItemPage, ItemValue } from "./types";

export function useItemSelection({
  collection,
  items,
  page,
  setMessage,
  onNavigate,
}: {
  collection: Collection;
  items: Item[];
  page: ItemPage;
  setMessage: (message: string) => void;
  onNavigate: (changes: Partial<ItemPage>) => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const endpoint = `/api/items/${encodeURIComponent(collection.name)}`;
  const itemKey = (item: Item) => String(item[collection.primaryKey.name]);

  function select(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setConfirmDelete(false);
  }

  function selectPage(checked: boolean) {
    setSelected(checked ? new Set(items.map(itemKey)) : new Set());
    setConfirmDelete(false);
  }

  async function removeSelected() {
    if (!collection.access.delete || selected.size === 0) return;
    const ids = items.map(itemKey).filter((id) => selected.has(id));
    setPending(true);
    setMessage("");
    let removed = 0;
    let failure = "";
    for (const id of ids) {
      try {
        await asmblyr.items.delete(collection.name, id);
        removed += 1;
      } catch (error) {
        failure =
          error instanceof ApiError
            ? error.message
            : "Не удалось связаться с сервером";
        break;
      }
    }
    setPending(false);
    setConfirmDelete(false);
    setSelected(new Set(ids.slice(removed)));
    setMessage(
      failure
        ? `Удалено: ${removed} из ${ids.length}. ${failure}`
        : `Удалено записей: ${removed}`,
    );
    if (removed > 0) {
      const remaining = BigInt(page.total) - BigInt(removed);
      if (
        page.number > 1 &&
        BigInt(page.number - 1) * BigInt(page.size) >= remaining
      ) {
        onNavigate({ number: page.number - 1 });
      } else router.refresh();
    }
  }

  async function saveBulk(
    values: Record<string, ItemValue>,
    close: () => void,
  ) {
    setPending(true);
    try {
      const result = await apiRequest<{ changed: number }>(endpoint, "PATCH", {
        ids: [...selected],
        values,
      });
      close();
      setSelected(new Set());
      setMessage(`Обновлено записей: ${result.changed}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return {
    selected,
    setSelected,
    confirmDelete,
    setConfirmDelete,
    pending,
    select,
    selectPage,
    removeSelected,
    saveBulk,
  };
}
