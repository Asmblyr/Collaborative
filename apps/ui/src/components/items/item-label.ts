import type { Collection, Item } from "./types";

export function itemLabelField(collection: Collection): string {
  const key = collection.primaryKey.name;
  const readable = (name: string) =>
    name === key ||
    collection.access.read?.includes("*") ||
    collection.access.read?.includes(name);
  if (collection.displayField)
    return readable(collection.displayField) ? collection.displayField : key;
  return (
    collection.fields.find(
      (field) =>
        readable(field.name) &&
        (field.type === "text" || field.type === "email"),
    )?.name ?? key
  );
}

export function itemLabel(value: unknown, id: string): string {
  return (typeof value === "string" && value.trim()) ||
    typeof value === "number"
    ? String(value).slice(0, 160)
    : id;
}

export function recordLabel(collection: Collection, item: Item): string {
  return (
    templateLabel(collection.displayTemplate, item) ??
    itemLabel(
      item[itemLabelField(collection)],
      String(item[collection.primaryKey.name]),
    )
  );
}

export function templateLabel(
  template: string | null | undefined,
  item: Item,
): string | null {
  if (!template) return null;
  const names = [
    ...template.matchAll(/\{\{\s*([a-z][a-z0-9_]{0,62})\s*\}\}/g),
  ].map((m) => m[1]);
  if (
    !names.length ||
    names.some((f) => !Object.hasOwn(item, f)) ||
    names.every((f) => item[f] == null || item[f] === "")
  )
    return null;
  return (
    template
      .replace(/\{\{\s*([a-z][a-z0-9_]{0,62})\s*\}\}/g, (_, field: string) =>
        ["string", "number", "boolean"].includes(typeof item[field])
          ? String(item[field])
          : "",
      )
      .trim()
      .slice(0, 160) || null
  );
}
