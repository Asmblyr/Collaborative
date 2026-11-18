"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  collectionHref,
  itemHref,
  recordIdFromPath,
} from "@/lib/item-location";

function isPlainStateObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeRecordHistoryState(
  currentState: unknown,
  returnHref: string,
): Record<string, unknown> {
  if (isPlainStateObject(currentState)) {
    return { ...currentState, asmblyrRecordReturn: returnHref };
  }
  return { asmblyrRecordReturn: returnHref };
}

export function stripRecordHistoryState(
  currentState: unknown,
): Record<string, unknown> | null {
  if (!isPlainStateObject(currentState)) {
    return null;
  }
  const rest = { ...currentState };
  delete rest.asmblyrRecordReturn;
  return rest;
}

export function useRecordLocation(collection: string) {
  const pathname = usePathname();
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
    startTransition(() => {
      router.refresh();
    });
  }, [recordId, router, startTransition]);

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
    // Next integrates native history with usePathname. Keep the current table,
    // selection and scroll mounted while preserving Next.js history state.
    window.history.pushState(
      mergeRecordHistoryState(window.history.state, returnHref),
      "",
      `${itemHref(collection, id)}${suffix}`,
    );
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
      window.history.replaceState(
        stripRecordHistoryState(window.history.state),
        "",
        listHref,
      );
    }
  }

  return { recordId, listPath, openRecord, closeRecord, recordChanged };
}
