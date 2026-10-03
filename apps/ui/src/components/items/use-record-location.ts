"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { collectionHref, itemHref, recordIdFromPath } from "@/lib/item-location";

export function useRecordLocation(collection: string) {
  const pathname = usePathname();
  const router = useRouter();
  const refreshNeeded = useRef(false);
  const recordId = recordIdFromPath(pathname, collection);
  const listPath = collectionHref(collection);
  // Refresh after returning to the list: a refresh on the record URL can
  // remount the route while the dialog is still animating its close.
  useEffect(() => {
    if (recordId !== null || !refreshNeeded.current) return;
    refreshNeeded.current = false;
    router.refresh();
  }, [recordId, router]);

  function recordChanged() { refreshNeeded.current = true; }

  function openRecord(id: string) {
    const query = new URLSearchParams(window.location.search);
    query.delete("item");
    const suffix = query.size ? `?${query}` : "";
    // Next integrates native history with usePathname. Keep the current table,
    // selection and scroll mounted while adding a shareable record URL.
    window.history.pushState({ asmblyrRecordReturn: `${listPath}${suffix}` }, "", `${itemHref(collection, id)}${suffix}`);
  }

  function closeRecord() {
    // A browser Back may already have removed the record before dialog cleanup.
    if (!recordId || recordIdFromPath(window.location.pathname, collection) !== recordId) return;
    const query = new URLSearchParams(window.location.search);
    query.delete("item");
    const listHref = `${listPath}${query.size ? `?${query}` : ""}`;
    if (window.history.state?.asmblyrRecordReturn === listHref) window.history.back();
    else window.history.replaceState(null, "", listHref);
  }

  return { recordId, listPath, openRecord, closeRecord, recordChanged };
}
