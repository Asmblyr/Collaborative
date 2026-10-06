import { apiRequest } from "@/lib/api-request";
import type {
  ColumnPreferences,
  TablePreferences,
} from "@/lib/table-preferences";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

const cache = new Map<string, string>();
const errors = new Map<string, string>();
const queues = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
export function subscribeColumns(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function readColumns(key: string, fallback: string) {
  return cache.get(key) ?? fallback;
}
export function columnError(key: string) {
  return errors.get(key) ?? "";
}

export function saveColumns(
  key: string,
  path: string,
  columns: ColumnPreferences,
  copy: UiCopy = originalCopy,
) {
  cache.set(key, JSON.stringify(columns));
  errors.delete(key);
  versions.set(key, (versions.get(key) ?? 0) + 1);
  const version = versions.get(key);
  const queue = (queues.get(key) ?? Promise.resolve()).then(async () => {
    try {
      await apiRequest(path, "PATCH", { columns });
    } catch {
      if (versions.get(key) === version)
        errors.set(
          key,
          copy("Не удалось сохранить столбцы в профиле. Повторите сохранение."),
        );
    } finally {
      notify();
    }
  });
  queues.set(key, queue);
  void queue.finally(() => {
    if (queues.get(key) === queue) queues.delete(key);
  });
  notify();
}

export async function refreshColumns(key: string, path: string) {
  await queues.get(key);
  if (errors.has(key)) return; // Preserve the unsaved draft for an explicit retry.
  const version = versions.get(key);
  try {
    const result = await apiRequest<TablePreferences>(path);
    if (version === versions.get(key)) {
      cache.set(key, JSON.stringify(result.columns));
      notify();
    }
  } catch {
    /* The server-rendered snapshot remains usable. */
  }
}
