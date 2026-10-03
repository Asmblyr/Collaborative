import type { Collection } from "./types";
import type { FilterGroup, FilterNode } from "./item-filter-options";

// This is an editable table preference, never a permission rule or an implicit
// predicate on API/relationship reads. An explicit empty URL filter means all.
export function defaultStateFilter(collection: Collection): string {
  const state = collection.state;
  if (!state || collection.mode === "single") return "";
  const canRead =
    collection.access.read?.includes("*") ||
    collection.access.read?.includes(state.field);
  if (!canRead) return "";
  const hidden = state.statuses
    .filter((status) => status.hidden)
    .map((status) => status.value);
  if (!hidden.length) return "";
  const children: FilterNode[] = [
    { field: state.field, op: "notIn", value: hidden },
  ];
  // Imported records may have unknown state. Keep them discoverable.
  const nullable = collection.fields.find(
    (field) => field.name === state.field,
  )?.nullable;
  if (nullable) children.push({ field: state.field, op: "isNull" });
  const filter: FilterGroup = { logic: nullable ? "or" : "and", children };
  return JSON.stringify(filter);
}
