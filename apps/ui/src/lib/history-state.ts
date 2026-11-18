"use client";

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export interface BrowserLocationPoint {
  pathname: string;
  search: string;
}

interface ShallowLocationSnapshot {
  pathname: string;
  search: string;
  forNextPathname: string;
  forNextSearch: string;
}

let currentSnapshot: ShallowLocationSnapshot | null = null;
let latestNextPathname = "";
let latestNextSearch = "";
let trackedLocation: BrowserLocationPoint | null = null;
let popListenerAttached = false;
const listeners = new Set<() => void>();

function isPlainStateObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemsCollectionSegment(pathname: string): string | null {
  const match = /^\/items\/([^/]+)(?:\/[^/]+)?$/.exec(pathname);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function normalizedQueryWithout(
  search: string,
  ignoredKeys: readonly string[],
): string {
  const params = new URLSearchParams(search);
  for (const key of ignoredKeys) {
    params.delete(key);
  }
  params.sort();
  return params.toString();
}

export function isIntraWorkspaceShallowPop(
  previous: BrowserLocationPoint,
  next: BrowserLocationPoint,
): boolean {
  const previousCollection = itemsCollectionSegment(previous.pathname);
  const nextCollection = itemsCollectionSegment(next.pathname);
  if (previousCollection !== null && previousCollection === nextCollection) {
    return (
      previous.pathname !== next.pathname &&
      normalizedQueryWithout(previous.search, ["item", "panel", "target"]) ===
        normalizedQueryWithout(next.search, ["item", "panel", "target"])
    );
  }
  if (previous.pathname === "/settings" && next.pathname === "/settings") {
    const previousTab = new URLSearchParams(previous.search).get("tab");
    const nextTab = new URLSearchParams(next.search).get("tab");
    return (
      previousTab !== nextTab &&
      normalizedQueryWithout(previous.search, ["tab"]) ===
        normalizedQueryWithout(next.search, ["tab"])
    );
  }
  return false;
}

/**
 * Builds state for shallow `window.history.pushState` / `replaceState` updates.
 *
 * Keeping `__NA: true` and Next.js's internal tree on `state` bypasses Next.js
 * 16's `ACTION_RESTORE` segment-cache traversal (which otherwise spawns RSC
 * fetches and enters soft-retry loops across `/items/[collection]` and
 * `/items/[collection]/[id]`), while preserving Next.js state for route-level
 * Back/Forward navigation.
 */
export function shallowHistoryState(
  currentState: unknown,
  patch?: Record<string, unknown>,
  omitKeys: readonly string[] = [],
): Record<string, unknown> {
  const result: Record<string, unknown> = { __NA: true };
  if (isPlainStateObject(currentState)) {
    for (const [key, value] of Object.entries(currentState)) {
      if (!omitKeys.includes(key)) {
        result[key] = value;
      }
    }
  }
  if (patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (!omitKeys.includes(key)) {
        result[key] = value;
      }
    }
  }
  result.__NA = true;
  return result;
}

function notifyShallowListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function recordShallowLocation() {
  if (typeof window === "undefined") {
    return;
  }
  const pathname = window.location.pathname;
  const search = window.location.search.replace(/^\?/, "");
  trackedLocation = { pathname, search: window.location.search };
  currentSnapshot = {
    pathname,
    search,
    forNextPathname: latestNextPathname || pathname,
    forNextSearch: latestNextSearch,
  };
  notifyShallowListeners();
}

function ensurePopListener() {
  if (typeof window === "undefined" || popListenerAttached) {
    return;
  }
  popListenerAttached = true;
  window.addEventListener(
    "popstate",
    (event) => {
      const next = {
        pathname: window.location.pathname,
        search: window.location.search,
      };
      const previous = trackedLocation;
      trackedLocation = next;
      if (previous && isIntraWorkspaceShallowPop(previous, next)) {
        event.stopImmediatePropagation();
        recordShallowLocation();
      }
    },
    true,
  );
}

function subscribeShallowLocation(listener: () => void): () => void {
  ensurePopListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getClientShallowSnapshot(): ShallowLocationSnapshot | null {
  return currentSnapshot;
}

function getServerShallowSnapshot(): ShallowLocationSnapshot | null {
  return null;
}

export function pushShallowHistory(
  url: string,
  patch?: Record<string, unknown>,
  omitKeys: readonly string[] = [],
): void {
  ensurePopListener();
  window.history.pushState(
    shallowHistoryState(window.history.state, patch, omitKeys),
    "",
    url,
  );
  recordShallowLocation();
}

export function replaceShallowHistory(
  url: string,
  patch?: Record<string, unknown>,
  omitKeys: readonly string[] = [],
): void {
  ensurePopListener();
  window.history.replaceState(
    shallowHistoryState(window.history.state, patch, omitKeys),
    "",
    url,
  );
  recordShallowLocation();
}

function useSyncedShallowSnapshot(nextPathname: string, nextSearch: string) {
  const snapshot = useSyncExternalStore(
    subscribeShallowLocation,
    getClientShallowSnapshot,
    getServerShallowSnapshot,
  );
  useLayoutEffect(() => {
    ensurePopListener();
    latestNextPathname = nextPathname;
    latestNextSearch = nextSearch;
    if (
      !currentSnapshot ||
      currentSnapshot.forNextPathname !== nextPathname ||
      currentSnapshot.forNextSearch !== nextSearch
    ) {
      trackedLocation = {
        pathname: window.location.pathname,
        search: window.location.search,
      };
    }
  }, [nextPathname, nextSearch]);
  if (
    snapshot &&
    snapshot.forNextPathname === nextPathname &&
    snapshot.forNextSearch === nextSearch
  ) {
    return snapshot;
  }
  return null;
}

export function useBrowserPathname(): string {
  const nextPathname = usePathname();
  const nextSearch = useSearchParams().toString();
  const snapshot = useSyncedShallowSnapshot(nextPathname, nextSearch);
  return snapshot ? snapshot.pathname : nextPathname;
}

export function useBrowserSearchParams(): URLSearchParams {
  const nextPathname = usePathname();
  const nextSearch = useSearchParams().toString();
  const snapshot = useSyncedShallowSnapshot(nextPathname, nextSearch);
  const activeSearch = snapshot ? snapshot.search : nextSearch;
  return useMemo(() => new URLSearchParams(activeSearch), [activeSearch]);
}
