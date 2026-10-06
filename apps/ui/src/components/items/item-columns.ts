import type { UiLocale } from "@asmblyr-collaborative/contracts";
import { collectionLabels } from "@asmblyr-collaborative/contracts/translations";
import type { Collection, CollectionField } from "./types";

export interface ItemColumn {
  name: string;
  label: string;
  type: string;
  relation?: CollectionField["relation"];
  presentation?: CollectionField["presentation"];
}

export function availableColumns(
  collection: Collection,
  locale: UiLocale = "ru",
): ItemColumn[] {
  const labels = collectionLabels(collection, locale);
  const grant = collection.access.read;
  const readable = (name: string) =>
    grant?.includes("*") || grant?.includes(name);
  return [
    {
      name: collection.primaryKey.name,
      label: labels.fields[collection.primaryKey.name].label,
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
      ? [
          {
            name: "created_at",
            label: labels.fields.created_at.label,
            type: "datetime",
          },
        ]
      : []),
    ...(collection.timestamps.updatedAt && readable("updated_at")
      ? [
          {
            name: "updated_at",
            label: labels.fields.updated_at.label,
            type: "datetime",
          },
        ]
      : []),
  ];
}
