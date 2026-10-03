"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Collection } from "./types";
import { availableColumns } from "./item-columns";
export type { ItemColumn } from "./item-columns";
import type { TablePreferences } from "@/lib/table-preferences";
import { subscribeColumns, readColumns, saveColumns, refreshColumns, columnError } from "./column-preferences-store";

interface ColumnState { order: string[]; hidden: string[] }

function reconcile(raw: string, names: string[]): ColumnState {
  let saved: { order?: unknown; hidden?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) saved = parsed;
  } catch { /* Ignore invalid local preferences. */ }
  const previous = Array.isArray(saved.order) ? saved.order.filter((name): name is string =>
    typeof name === "string" && names.includes(name)) : [];
  const hidden = Array.isArray(saved.hidden) ? saved.hidden.filter((name): name is string =>
    typeof name === "string" && names.includes(name)) : [];
  const order = [...new Set([...previous, ...names])];
  return { order, hidden: hidden.length === order.length ? [] : hidden };
}

export function useItemColumns(collection: Collection, userId: string, preferences: TablePreferences | null) {
  const storageKey = `${userId}:${preferences?.collectionId ?? collection.name}`;
  const endpoint = `/api/users/me/table-preferences/${encodeURIComponent(collection.name)}`;
  const fallback = JSON.stringify(preferences?.columns ?? null);
  const snapshot = useCallback(() => readColumns(storageKey, fallback), [storageKey, fallback]);
  const raw = useSyncExternalStore(subscribeColumns, snapshot, () => fallback);
  const error = useSyncExternalStore(subscribeColumns, () => columnError(storageKey), () => "");
  const legacy = useSyncExternalStore(subscribeColumns, () => {
    try { return localStorage.getItem(`asmblyr.items.columns.${collection.name}`) ?? ""; } catch { return ""; }
  }, () => "");
  useEffect(() => { if (collection.access.read) void refreshColumns(storageKey, endpoint); }, [storageKey, endpoint, collection.access.read, fallback]);
  const available = useMemo(() => availableColumns(collection), [collection]);
  const names = available.map((column) => column.name);
  const state = reconcile(raw, names);
  const byName = new Map(available.map((column) => [column.name, column]));

  function toggle(name: string, show: boolean) {
    if (!names.includes(name)) return;
    if (!show && state.order.filter((column) => !state.hidden.includes(column)).length <= 1) return;
    const hidden = show ? state.hidden.filter((column) => column !== name)
      : [...new Set([...state.hidden, name])];
    saveColumns(storageKey, endpoint, { order: state.order, hidden });
  }

  function move(name: string, target: string, after = false) {
    if (name === target || !names.includes(name) || !names.includes(target)) return;
    const order = state.order.filter((column) => column !== name);
    order.splice(order.indexOf(target) + Number(after), 0, name);
    saveColumns(storageKey, endpoint, { order, hidden: state.hidden });
  }

  return { snapshot: state, apply: (columns: ColumnState) => saveColumns(storageKey, endpoint, reconcile(JSON.stringify(columns), names)),
    all: state.order.map((name) => byName.get(name)!).filter(Boolean),
    visible: state.order.filter((name) => !state.hidden.includes(name))
      .map((name) => byName.get(name)!).filter(Boolean), toggle, move, error, hasLegacy: Boolean(legacy),
    retry: () => saveColumns(storageKey, endpoint, state),
    importLegacy: () => saveColumns(storageKey, endpoint, reconcile(legacy, names)) };
}
