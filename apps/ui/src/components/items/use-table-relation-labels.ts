"use client";

import { useEffect, useState } from "react";
import { asmblyr } from "@/lib/asmblyr";
import { itemLabel, templateLabel } from "./item-label";
import { tableRelationRequests, type TableRelationRequest } from "./table-relation-requests";
import type { Collection, Item } from "./types";
import type { ItemColumn } from "./use-item-columns";
import { useDraftPreviews } from "./record-draft-context";

export function useTableRelationLabels(
  catalog: Collection[],
  items: Item[],
  columns: ItemColumn[],
) {
  const previews = useDraftPreviews();
  const request = JSON.stringify(tableRelationRequests(catalog, items, columns));
  const [result, setResult] = useState<{ request: string; labels: Map<string, string> } | null>(
    null,
  );

  useEffect(() => {
    const targets = (JSON.parse(request) as TableRelationRequest[]).map((target) => ({
      ...target,
      ids: target.ids.filter((id) => !id.startsWith("draft:")),
    }));
    if (!targets.length) return;
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
                JSON.stringify([target.collection, String(item[target.key])]),
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
      if (!controller.signal.aborted) setResult({ request, labels: new Map(batches.flat()) });
    });
    return () => controller.abort();
  }, [request, items]);

  const labels = new Map(result?.request === request ? result.labels : []);
  for (const target of JSON.parse(request) as TableRelationRequest[])
    for (const id of target.ids) {
      const key = JSON.stringify([target.collection, id]);
      if (previews.has(key)) labels.set(key, previews.get(key)!.label);
    }
  return labels;
}
