import type { FilterScope } from "./item-filter-options";
import { useRelationItems } from "./use-relation-items";

export function useFilterRelationItems(scope: FilterScope, selected: string[], open: boolean) {
  const key = scope.presenceField!.split(".")[1];
  const label = scope.displayField ?? scope.fields.find((field) =>
    field.type === "text" || field.type === "email")?.name.split(".")[1];
  return useRelationItems(scope.collection, key, label, selected, open, scope.displayTemplate);
}
