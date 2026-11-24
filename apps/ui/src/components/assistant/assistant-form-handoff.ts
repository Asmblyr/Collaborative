import { collectionHref, itemHref } from "@/lib/item-location";
import type { Item, ItemValue } from "@/components/items/types";

export const ASSISTANT_FORM_PREFILL_KEY = "asmblyr:assistant-form-prefill";
export const ASSISTANT_FORM_PREFILL_EVENT = "asmblyr:assistant-form-prefill";
export const FORM_PREFILL_TTL_MS = 5 * 60 * 1000;

interface StoredFormPrefill {
  collection: string;
  values: Item;
  stagedAt: number;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function defaultStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function normalizeFormPrefillValues(
  values: Record<string, unknown>,
): Item {
  const normalized: Item = {};
  for (const [key, value] of Object.entries(values)) {
    if (FORBIDDEN_KEYS.has(key) || value === undefined) {
      continue;
    }
    normalized[key] = value as ItemValue;
  }
  return normalized;
}

export function stageFormPrefill(
  collection: string,
  values: Record<string, unknown>,
  storage: Storage | null = defaultStorage(),
  now = Date.now(),
): boolean {
  if (!storage || !collection.trim()) {
    return false;
  }
  const payload: StoredFormPrefill = {
    collection,
    values: normalizeFormPrefillValues(values),
    stagedAt: now,
  };
  try {
    storage.setItem(ASSISTANT_FORM_PREFILL_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function consumeFormPrefill(
  collection: string,
  storage: Storage | null = defaultStorage(),
  now = Date.now(),
): Item | null {
  if (!storage || !collection.trim()) {
    return null;
  }
  let raw: string | null = null;
  try {
    raw = storage.getItem(ASSISTANT_FORM_PREFILL_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredFormPrefill>;
    if (
      typeof parsed?.collection !== "string" ||
      typeof parsed?.stagedAt !== "number" ||
      !parsed.values ||
      typeof parsed.values !== "object" ||
      Array.isArray(parsed.values)
    ) {
      storage.removeItem(ASSISTANT_FORM_PREFILL_KEY);
      return null;
    }
    if (
      now - parsed.stagedAt > FORM_PREFILL_TTL_MS ||
      now < parsed.stagedAt - 60_000
    ) {
      storage.removeItem(ASSISTANT_FORM_PREFILL_KEY);
      return null;
    }
    if (parsed.collection !== collection) {
      return null;
    }
    storage.removeItem(ASSISTANT_FORM_PREFILL_KEY);
    return normalizeFormPrefillValues(parsed.values);
  } catch {
    try {
      storage.removeItem(ASSISTANT_FORM_PREFILL_KEY);
    } catch {
      /* Ignore storage removal errors. */
    }
    return null;
  }
}

export function dispatchFormPrefillEvent(collection: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(ASSISTANT_FORM_PREFILL_EVENT, {
      detail: { collection },
    }),
  );
}

export function recordCardHref(
  collection: string,
  recordId: string,
  withWorkspace?: (href: string) => string,
): string {
  const base = itemHref(collection, recordId);
  return withWorkspace ? withWorkspace(base) : base;
}

export function formCardHref(
  collection: string,
  withWorkspace?: (href: string) => string,
): string {
  const base = collectionHref(collection);
  return withWorkspace ? withWorkspace(base) : base;
}

export function isOnCollectionListPath(
  pathname: string,
  collection: string,
): boolean {
  return pathname === collectionHref(collection);
}
