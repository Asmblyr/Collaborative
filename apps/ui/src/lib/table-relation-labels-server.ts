import { reconcileColumns } from "@/components/items/column-state";
import { availableColumns } from "@/components/items/item-columns";
import { itemLabel, templateLabel } from "@/components/items/item-label";
import {
  tableRelationRequests,
  type TableRelationRequest,
} from "@/components/items/table-relation-requests";
import type { Collection, Item, ItemList } from "@/components/items/types";
import { userReferenceUrl } from "@/components/items/user-reference";
import type { ColumnPreferences } from "./table-preferences";
import { coreAddress } from "./session";

function chunkRelationTarget(
  target: TableRelationRequest,
): TableRelationRequest[] {
  const count = Math.ceil(target.ids.length / 20);
  return Array.from({ length: count }, (_, index) => ({
    ...target,
    ids: target.ids.slice(index * 20, index * 20 + 20),
  }));
}

export async function loadInitialTableRelationLabels({
  token,
  collection,
  catalog,
  items,
  columns,
}: {
  token: string;
  collection: Collection;
  catalog: Collection[];
  items: Item[];
  columns: ColumnPreferences | null | undefined;
}): Promise<Record<string, string>> {
  if (!items.length) {
    return {};
  }

  const available = availableColumns(collection);
  const names = available.map((column) => column.name);
  const reconciled = reconcileColumns(JSON.stringify(columns ?? null), names);
  const byName = new Map(available.map((column) => [column.name, column]));
  const visible = reconciled.order
    .filter((name) => !reconciled.hidden.includes(name))
    .map((name) => byName.get(name))
    .filter((column): column is NonNullable<typeof column> => Boolean(column));

  const requests = tableRelationRequests(catalog, items, visible);
  if (!requests.length) {
    return {};
  }

  const jobs = requests.flatMap(chunkRelationTarget);
  const headers = { authorization: `Bearer ${token}` };

  const batches = await Promise.all(
    jobs.map(
      async (target): Promise<readonly (readonly [string, string])[]> => {
        try {
          if (target.collection === "@users") {
            const apiPath = userReferenceUrl(
              new URLSearchParams({
                limit: "20",
                filter: JSON.stringify({
                  logic: "and",
                  children: [{ field: "id", op: "in", value: target.ids }],
                }),
              }),
            );
            const corePath = apiPath.replace(/^\/api/, "");
            const response = await fetch(coreAddress(corePath), {
              headers,
              cache: "no-store",
              signal: AbortSignal.timeout(2000),
            });
            if (!response.ok) {
              return [];
            }
            const data = (await response.json()) as ItemList;
            return data.data.map(
              (item) =>
                [
                  JSON.stringify([target.collection, String(item.id)]),
                  String(item.label),
                ] as const,
            );
          }

          const query = new URLSearchParams({
            limit: "20",
            filter: JSON.stringify({
              logic: "and",
              children: [{ field: target.key, op: "in", value: target.ids }],
            }),
          });
          const response = await fetch(
            coreAddress(
              `/items/${encodeURIComponent(target.collection)}?${query}`,
            ),
            {
              headers,
              cache: "no-store",
              signal: AbortSignal.timeout(2000),
            },
          );
          if (!response.ok) {
            return [];
          }
          const data = (await response.json()) as ItemList;
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
      },
    ),
  );

  return Object.fromEntries(batches.flat());
}
