import type { ItemValue } from "./types";

export function displayValue(value: ItemValue, type: string): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? "Да" : "Нет";
  if (type === "datetime") {
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf())
      ? String(value)
      : `${date.toLocaleString("ru-RU", { timeZone: "UTC" })} UTC`;
  }
  if (type === "json" || type === "files") return JSON.stringify(value);
  if (type === "decimal") return String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return String(value);
}
