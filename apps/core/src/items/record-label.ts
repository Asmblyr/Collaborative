import { itemLabel, itemLabelField } from "./item-label.js";
import { renderLabelTemplate, templateFields } from "../collections/label-template.js";

export function recordLabelPlan(settings: { primaryKey: { name: string }; displayField?: string | null; displayTemplate?: string | null },
  fields: Iterable<{ name: string; type: string | null }>, allowed: string[], override?: string | null) {
  const list = [...fields], key = settings.primaryKey.name;
  const fallback = override ?? itemLabelField(key, list, settings.displayField, allowed);
  const available = new Set([key, ...list.filter((f) => ["text", "email", "integer", "decimal", "boolean", "datetime"].includes(f.type ?? "") &&
    (allowed.includes("*") || allowed.includes(f.name))).map((f) => f.name)]);
  const names = settings.displayTemplate ? templateFields(settings.displayTemplate) : [];
  const template = !override && names.length && names.every((f) => available.has(f)) ? settings.displayTemplate : null;
  return { columns: [...new Set([key, fallback, ...(template ? names : [])])],
    label: (row: Record<string, unknown>) => renderLabelTemplate(template, row) ??
      itemLabel(row[fallback] instanceof Date ? row[fallback].toISOString() : row[fallback], row[key]) };
}
