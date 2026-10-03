import { availableColumns, type ItemColumn } from "./item-columns";
import { itemLabel, itemLabelField, templateLabel } from "./item-label";
import type { Collection, Item } from "./types";

// Follow the relation's configured columns first, then use readable M2O fields
// to distinguish records with the same name. Never expand more than one hop.
export function recordChoiceColumns(collection: Collection, catalog: Collection[], preferred: string[] = []): ItemColumn[] {
  const columns = availableColumns(collection);
  const rank = (column: ItemColumn) => preferred.includes(column.name) ? preferred.indexOf(column.name) :
    column.name === collection.displayField ? -1 : collection.fields.find((field) => field.name === column.name)?.searchable ? 100 : 101;
  return columns.filter((column) => column.relation?.kind === "m2o" &&
    catalog.some((target) => target.name === column.relation?.collection && target.access.read))
    .sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}

export function recordChoicePresentation(collection: Collection, item: Item, columns: ItemColumn[],
  labels: Map<string, string>, labelField?: string) {
  const id = String(item[collection.primaryKey.name]);
  const field = labelField ?? itemLabelField(collection);
  const allowed = collection.access.read;
  const readable = field === collection.primaryKey.name || allowed?.includes("*") || allowed?.includes(field);
  const permitted = Object.fromEntries(Object.entries(item).filter(([name]) => name === collection.primaryKey.name ||
    allowed?.includes("*") || allowed?.includes(name)));
  const related = columns.flatMap((column) => {
    if (!column.relation || !Object.hasOwn(permitted, column.name) || item[column.name] == null) return [];
    const value = labels.get(JSON.stringify([column.relation.collection, String(item[column.name])]));
    return value ? [{ name: column.name, caption: column.label, value }] : [];
  });
  const ownLabel = (!labelField && templateLabel(collection.displayTemplate, permitted)) ||
    (readable ? related.find((entry) => entry.name === field)?.value || itemLabel(item[field], "") : "");
  const primary = columns[0]?.name;
  const label = ownLabel || related.find((entry) => entry.name === primary)?.value || id;
  const context = related.filter((entry) => (ownLabel || entry.name !== primary) && entry.name !== field);
  return { label,
    detail: [...context.map((entry) => `${entry.caption}: ${entry.value}`), `ID: ${id}`].join(" · "),
    selectedLabel: [label, ...context.map((entry) => entry.value)].join(" · "),
  };
}
