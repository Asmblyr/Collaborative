"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import type { Collection } from "./types";
import { availableColumns } from "./item-columns";
export type { ItemColumn } from "./item-columns";
import type {
  TablePreferences,
  ColumnPreferences,
} from "@/lib/table-preferences";
import { isColumnWidth } from "@asmblyr-collaborative/contracts";
import { reconcileColumns as reconcile } from "./column-state";
import {
  subscribeColumns,
  readColumns,
  saveColumns,
  refreshColumns,
  columnError,
} from "./column-preferences-store";
import { useUiCopy } from "@/lib/ui-copy";

export function useItemColumns(
  collection: Collection,
  userId: string,
  preferences: TablePreferences | null,
) {
  const copy = useUiCopy();

  const { locale } = useTranslations();
  const storageKey = `${userId}:${preferences?.collectionId ?? collection.name}`;
  const endpoint = `/api/users/me/table-preferences/${encodeURIComponent(collection.name)}`;
  const fallback = JSON.stringify(preferences?.columns ?? null);
  const snapshot = useCallback(
    () => readColumns(storageKey, fallback),
    [storageKey, fallback],
  );
  const raw = useSyncExternalStore(subscribeColumns, snapshot, () => fallback);
  const error = useSyncExternalStore(
    subscribeColumns,
    () => columnError(storageKey),
    () => "",
  );
  const legacy = useSyncExternalStore(
    subscribeColumns,
    () => {
      try {
        return (
          localStorage.getItem(`asmblyr.items.columns.${collection.name}`) ?? ""
        );
      } catch {
        return "";
      }
    },
    () => "",
  );
  useEffect(() => {
    if (collection.access.read) {
      void refreshColumns(storageKey, endpoint);
    }
  }, [storageKey, endpoint, collection.access.read, fallback]);
  const available = useMemo(
    () => availableColumns(collection, locale),
    [collection, locale],
  );
  const names = available.map((column) => column.name);
  const state = reconcile(raw, names);
  const byName = new Map(available.map((column) => [column.name, column]));

  function toggle(name: string, show: boolean) {
    if (!names.includes(name)) {
      return;
    }
    if (
      !show &&
      state.order.filter((column) => !state.hidden.includes(column)).length <= 1
    ) {
      return;
    }
    const hidden = show
      ? state.hidden.filter((column) => column !== name)
      : [...new Set([...state.hidden, name])];
    saveColumns(storageKey, endpoint, { ...state, hidden }, copy);
  }

  function move(name: string, target: string, after = false) {
    if (name === target || !names.includes(name) || !names.includes(target)) {
      return;
    }
    const order = state.order.filter((column) => column !== name);
    order.splice(order.indexOf(target) + Number(after), 0, name);
    saveColumns(storageKey, endpoint, { ...state, order }, copy);
  }

  function resize(name: string, width: number | undefined) {
    if (
      !names.includes(name) ||
      (width !== undefined && !isColumnWidth(width))
    ) {
      return;
    }
    const widths = { ...state.widths };
    if (width === undefined) {
      delete widths[name];
    } else {
      Object.defineProperty(widths, name, {
        value: width,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    saveColumns(storageKey, endpoint, { ...state, widths }, copy);
  }

  return {
    snapshot: state,
    apply: (columns: ColumnPreferences) =>
      saveColumns(
        storageKey,
        endpoint,
        reconcile(JSON.stringify(columns), names),
        copy,
      ),
    all: state.order.map((name) => byName.get(name)!).filter(Boolean),
    visible: state.order
      .filter((name) => !state.hidden.includes(name))
      .map((name) => byName.get(name)!)
      .filter(Boolean),
    toggle,
    move,
    resize,
    error,
    hasLegacy: Boolean(legacy),
    retry: () => saveColumns(storageKey, endpoint, state, copy),
    importLegacy: () =>
      saveColumns(storageKey, endpoint, reconcile(legacy, names), copy),
  };
}
