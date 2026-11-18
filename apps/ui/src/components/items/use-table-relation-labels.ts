"use client";

import { useEffect, useMemo, useState } from "react";
import { asmblyr } from "@/lib/asmblyr";
import { itemLabel, templateLabel } from "./item-label";
import {
  tableRelationRequests,
  type TableRelationRequest,
} from "./table-relation-requests";
import type { Collection, Item, ItemList } from "./types";
import type { ItemColumn } from "./use-item-columns";
import { useDraftPreviews } from "./record-draft-context";
import { userReferenceUrl } from "./user-reference";

export function relationLabelKey(collection: string, id: string): string {
  return JSON.stringify([collection, id]);
}

export function missingRelationRequests(
  requests: readonly TableRelationRequest[],
  known: ReadonlyMap<string, string>,
): TableRelationRequest[] {
  const missing: TableRelationRequest[] = [];
  for (const target of requests) {
    const ids = target.ids.filter(
      (id) =>
        !id.startsWith("draft:") &&
        !known.has(relationLabelKey(target.collection, id)),
    );
    if (ids.length > 0) {
      missing.push({ ...target, ids });
    }
  }
  return missing;
}

export function mergeRelationLabelMaps(
  cached: ReadonlyMap<string, string>,
  initial?: Record<string, string>,
  previews?: ReadonlyMap<string, { label: string }>,
  requests: readonly TableRelationRequest[] = [],
): Map<string, string> {
  const merged = new Map(cached);
  if (initial) {
    for (const [key, label] of Object.entries(initial)) {
      merged.set(key, label);
    }
  }
  if (previews) {
    for (const target of requests) {
      for (const id of target.ids) {
        const key = relationLabelKey(target.collection, id);
        const preview = previews.get(key);
        if (preview) {
          merged.set(key, preview.label);
        }
      }
    }
  }
  return merged;
}

export function useTableRelationLabels(
  catalog: Collection[],
  items: Item[],
  columns: ItemColumn[],
  initialLabels?: Record<string, string>,
): Map<string, string> {
  const previews = useDraftPreviews();
  const [cached, setCached] = useState<Map<string, string>>(
    () => new Map(Object.entries(initialLabels ?? {})),
  );
  const initialKey = JSON.stringify(initialLabels ?? null);
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (prevInitialKey !== initialKey) {
    setPrevInitialKey(initialKey);
    if (initialLabels) {
      setCached((current) => mergeRelationLabelMaps(current, initialLabels));
    }
  }

  const requests = useMemo(
    () => tableRelationRequests(catalog, items, columns),
    [catalog, items, columns],
  );
  const known = useMemo(
    () => mergeRelationLabelMaps(cached, initialLabels),
    [cached, initialLabels],
  );
  const missingKey = JSON.stringify(missingRelationRequests(requests, known));

  useEffect(() => {
    const targets = JSON.parse(missingKey) as TableRelationRequest[];
    if (!targets.length) {
      return;
    }
    const controller = new AbortController();
    const jobs = targets.flatMap((target) =>
      Array.from({ length: Math.ceil(target.ids.length / 20) }, (_, index) => ({
        ...target,
        ids: target.ids.slice(index * 20, index * 20 + 20),
      })),
    );
    void Promise.all(
      jobs.map(async (target) => {
        try {
          if (target.collection === "@users") {
            const response = await fetch(
              userReferenceUrl(
                new URLSearchParams({
                  limit: "20",
                  filter: JSON.stringify({
                    logic: "and",
                    children: [{ field: "id", op: "in", value: target.ids }],
                  }),
                }),
              ),
              { signal: controller.signal },
            );
            if (!response.ok) {
              return [];
            }
            const data = (await response.json()) as ItemList;
            return data.data.map(
              (item) =>
                [
                  relationLabelKey(target.collection, String(item.id)),
                  String(item.label),
                ] as const,
            );
          }

          const data = await asmblyr.items.list(
            target.collection,
            {
              limit: 20,
              filter: {
                logic: "and",
                children: [{ field: target.key, op: "in", value: target.ids }],
              },
            },
            { signal: controller.signal },
          );
          return data.data.map(
            (item) =>
              [
                relationLabelKey(target.collection, String(item[target.key])),
                data.labels?.[String(item[target.key])] ??
                  templateLabel(target.template, item) ??
                  itemLabel(item[target.label], String(item[target.key])),
              ] as const,
          );
        } catch {
          return [];
        }
      }),
    ).then((batches) => {
      if (controller.signal.aborted) {
        return;
      }
      const entries = batches.flat();
      if (!entries.length) {
        return;
      }
      setCached((current) => {
        const next = new Map(current);
        for (const [key, label] of entries) {
          next.set(key, label);
        }
        return next;
      });
    });
    return () => controller.abort();
  }, [missingKey]);

  return mergeRelationLabelMaps(known, undefined, previews, requests);
}
