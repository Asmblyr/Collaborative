"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import { asmblyr } from "@/lib/asmblyr";
import { ApiError } from "@asmblyr-collaborative/sdk";
import type { Collection, Item, ItemPage, ItemValue } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

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
  setMessage: (message: string, variant?: "success" | "error") => void;
  onNavigate: (changes: Partial<ItemPage>) => void;
}) {
  const copy = useUiCopy();

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
    if (!collection.access.delete || selected.size === 0) {
      return;
    }
    const ids = items.map(itemKey).filter((id) => selected.has(id));
    setPending(true);
    setMessage("");
    const deletedIds = new Set<string>();
    let failure = "";
    let cursor = 0;

    async function worker() {
      while (cursor < ids.length && !failure) {
        const id = ids[cursor];
        cursor += 1;
        try {
          await asmblyr.items.delete(collection.name, id);
          deletedIds.add(id);
        } catch (error) {
          if (!failure) {
            failure =
              error instanceof ApiError
                ? error.message
                : copy("Не удалось связаться с сервером");
          }
          break;
        }
      }
    }

    const workerCount = Math.min(6, ids.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    const removed = deletedIds.size;

    setPending(false);
    setConfirmDelete(false);
    setSelected(new Set(ids.filter((id) => !deletedIds.has(id))));
    setMessage(
      failure
        ? copy("Удалено: {{value0}} из {{value1}}. {{value2}}", {
            value0: removed,
            value1: ids.length,
            value2: failure,
          })
        : copy.plural(removed, {
            one: "Удалена {{count}} запись",
            few: "Удалено {{count}} записи",
            many: "Удалено {{count}} записей",
          }),
      failure ? "error" : "success",
    );
    if (removed > 0) {
      const remaining = BigInt(page.total) - BigInt(removed);
      if (
        page.number > 1 &&
        BigInt(page.number - 1) * BigInt(page.size) >= remaining
      ) {
        onNavigate({ number: page.number - 1 });
      } else {
        router.refresh();
      }
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
      setMessage(
        copy.plural(result.changed, {
          one: "Обновлена {{count}} запись",
          few: "Обновлено {{count}} записи",
          many: "Обновлено {{count}} записей",
        }),
      );
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
