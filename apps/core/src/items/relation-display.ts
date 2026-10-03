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
  // A stable identity remains visible even when a record's label is empty.
  // Other columns are chosen explicitly in the relation presentation settings.
  const defaults = [...new Set([key, labelField])].filter(readable);
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
