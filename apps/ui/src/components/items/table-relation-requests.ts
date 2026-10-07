import { itemLabelField } from "./item-label";
import type { Collection, Item } from "./types";
import type { ItemColumn } from "./use-item-columns";
import { userReferenceCollection } from "./user-reference";

export interface TableRelationRequest {
  collection: string;
  key: string;
  label: string;
  template?: string;
  ids: string[];
}

export function tableRelationRequests(
  catalog: Collection[],
  items: Item[],
  columns: ItemColumn[],
): TableRelationRequest[] {
  const requests = new Map<string, TableRelationRequest>();
  for (const column of columns) {
    if (column.relation?.kind !== "m2o") continue;
    const target =
      column.relation.collection === "@users"
        ? userReferenceCollection("users")
        : catalog.find((entry) => entry.name === column.relation?.collection);
    if (!target?.access.read) continue;
    const request = requests.get(target.name) ?? {
      collection: target.name,
      key: target.primaryKey.name,
      label: itemLabelField(target),
      ...(target.displayTemplate ? { template: target.displayTemplate } : {}),
      ids: [],
    };
    const ids = items
      .map((item) => item[column.name])
      .filter((id) => id !== null && id !== undefined)
      .map(String);
    request.ids = [...new Set([...request.ids, ...ids])];
    if (request.ids.length) requests.set(target.name, request);
  }
  return [...requests.values()];
}
