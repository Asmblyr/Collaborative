"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  pushShallowHistory,
  replaceShallowHistory,
  shallowHistoryState,
  useBrowserPathname,
} from "@/lib/history-state";
import {
  collectionHref,
  itemHref,
  recordIdFromPath,
} from "@/lib/item-location";

export function mergeRecordHistoryState(
  currentState: unknown,
  returnHref: string,
): Record<string, unknown> {
  return shallowHistoryState(currentState, { asmblyrRecordReturn: returnHref });
}

export function stripRecordHistoryState(
  currentState: unknown,
): Record<string, unknown> {
  return shallowHistoryState(currentState, undefined, ["asmblyrRecordReturn"]);
}

export function useRecordLocation(collection: string) {
  const nextPathname = usePathname();
  const pathname = useBrowserPathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refreshNeeded = useRef(false);
  const recordId = recordIdFromPath(pathname, collection);
  const listPath = collectionHref(collection);

  // Refresh after returning to the list: a refresh on the record URL can
  // remount the route while the dialog is still animating its close.
  useEffect(() => {
    if (recordId !== null || !refreshNeeded.current) {
      return;
    }
    refreshNeeded.current = false;
    const query = new URLSearchParams(window.location.search);
    query.delete("item");
    query.delete("panel");
    query.delete("target");
    const listHref = `${listPath}${query.size ? `?${query}` : ""}`;
    startTransition(() => {
      if (recordIdFromPath(nextPathname, collection) !== null) {
        router.replace(listHref, { scroll: false });
      } else {
        router.refresh();
      }
    });
  }, [collection, listPath, nextPathname, recordId, router, startTransition]);

  function recordChanged() {
    refreshNeeded.current = true;
  }

  function openRecord(id: string) {
    const query = new URLSearchParams(window.location.search);
    query.delete("item");
    query.delete("panel");
    query.delete("target");
    const suffix = query.size ? `?${query}` : "";
    const returnHref = `${listPath}${suffix}`;
    pushShallowHistory(`${itemHref(collection, id)}${suffix}`, {
      asmblyrRecordReturn: returnHref,
    });
  }

  function closeRecord() {
    // A browser Back may already have removed the record before dialog cleanup.
    if (
      !recordId ||
      recordIdFromPath(window.location.pathname, collection) !== recordId
    ) {
      return;
    }
    const query = new URLSearchParams(window.location.search);
    query.delete("item");
    query.delete("panel");
    query.delete("target");
    const listHref = `${listPath}${query.size ? `?${query}` : ""}`;
    if (window.history.state?.asmblyrRecordReturn === listHref) {
      window.history.back();
    } else {
      replaceShallowHistory(listHref, undefined, ["asmblyrRecordReturn"]);
    }
  }

  return { recordId, listPath, openRecord, closeRecord, recordChanged };
}
