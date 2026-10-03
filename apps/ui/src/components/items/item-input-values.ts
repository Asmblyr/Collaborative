import type { CollectionField, Item, ItemValue } from "./types";

export function inputValue(field: CollectionField, item?: Item): string {
  const value = item?.[field.name];
  if (value == null) return "";
  if (field.type === "datetime" && typeof value === "string") return value.slice(0, 19);
  if (field.type === "json" || field.type === "files") return JSON.stringify(value);
  return String(value);
}

export function payloadValue(field: CollectionField, value: string): ItemValue {
  if (value === "") {
    if (field.nullable && !field.required) return null;
    throw new Error(`Заполните поле ${field.presentation?.label || field.name}`);
  }
  if (field.type === "integer") return Number(value);
  if (field.type === "boolean") return value === "true";
  if (field.type === "json" || field.type === "files") {
    try { return JSON.parse(value) as ItemValue; }
    catch { throw new Error(`Некорректный JSON в поле ${field.presentation?.label || field.name}`); }
  }
  if (field.type === "datetime") {
    const date = new Date(`${value}Z`);
    if (Number.isNaN(date.valueOf()) || !date.toISOString().startsWith(value)) throw new Error("Некорректная дата и время");
    return date.toISOString();
  }
  // Decimal stays a string to preserve PostgreSQL numeric precision.
  return value;
}

export function arrayDraft(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []; }
  catch { return []; }
}
