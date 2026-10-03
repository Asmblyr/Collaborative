import type { Collection, CollectionField } from "./types";

export interface ItemColumn {
  name: string;
  label: string;
  type: string;
  relation?: CollectionField["relation"];
  presentation?: CollectionField["presentation"];
}

export function availableColumns(collection: Collection): ItemColumn[] {
  const grant = collection.access.read;
  const readable = (name: string) =>
    grant?.includes("*") || grant?.includes(name);
  return [
    {
      name: collection.primaryKey.name,
      label: collection.primaryKey.name,
      type: collection.primaryKey.type,
    },
    ...collection.fields
      .filter((field) => field.type !== "alias" && readable(field.name))
      .map((field) => ({
        name: field.name,
        label: field.presentation?.label || field.name,
        type: field.type,
        relation: field.relation,
        presentation: field.presentation,
      })),
    ...(collection.timestamps.createdAt && readable("created_at")
      ? [{ name: "created_at", label: "Создано", type: "datetime" }]
      : []),
    ...(collection.timestamps.updatedAt && readable("updated_at")
      ? [{ name: "updated_at", label: "Обновлено", type: "datetime" }]
      : []),
  ];
}
