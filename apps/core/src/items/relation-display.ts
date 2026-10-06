import { itemLabelField } from "./item-label.js";
import { fieldGranted, type RelationContext } from "./relation-context.js";

export function relationDisplay({ alias, target, allowed }: RelationContext) {
  const { settings, fields } = target;
  const key = settings.primaryKey.name;
  const physical = new Set([
    key,
    ...fields.keys(),
    ...(settings.timestamps.createdAt ? ["created_at"] : []),
    ...(settings.timestamps.updatedAt ? ["updated_at"] : []),
  ]);
  const readable = (name: string) =>
    physical.has(name) && (name === key || fieldGranted(allowed, name));
  const config = alias.presentation?.relation;
  const fallback = itemLabelField(
    key,
    fields.values(),
    settings.displayField,
    allowed,
  );
  const labelField =
    config?.labelField && readable(config.labelField)
      ? config.labelField
      : fallback;
  // Reference context distinguishes rows whose own label is empty or repeated.
  // The parent reference is already known; keep other automatic context bounded.
  const references = [...fields.values()]
    .filter(
      (field) =>
        field.relation &&
        field.relation.collection !== alias.collection_name &&
        !field.presentation?.sensitive &&
        readable(field.name),
    )
    .slice(0, 2)
    .map((field) => field.name);
  const defaults = [...new Set([key, labelField, ...references])].filter(
    readable,
  );
  const columns = (config?.columns.length ? config.columns : defaults).filter(
    readable,
  );
  return {
    layout: config?.layout ?? "table",
    columns: columns.length ? columns : [key],
    labelField,
    sortField:
      config?.sortField && readable(config.sortField) ? config.sortField : key,
    direction: config?.direction ?? "asc",
    pageSize: config?.pageSize ?? 10,
    allowCreate: config?.allowCreate ?? true,
    allowSelect: config?.allowSelect ?? true,
  };
}
