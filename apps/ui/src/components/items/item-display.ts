import type { ItemValue } from "./types";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export function displayValue(
  value: ItemValue,
  type: string,
  copy: UiCopy = originalCopy,
): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? copy("Да") : copy("Нет");
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    if (copy.locale === "en") {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        dateStyle: "medium",
      }).format(new Date(`${value}T00:00:00Z`));
    }
    return String(value).split("-").reverse().join(".");
  }
  if (type === "datetime") {
    const date = new Date(String(value));
    return Number.isNaN(date.valueOf())
      ? String(value)
      : `${date.toLocaleString(copy.locale === "en" ? "en-US" : "ru-RU", { timeZone: "UTC" })} UTC`;
  }
  if (type === "json" || type === "files") return JSON.stringify(value);
  if (type === "decimal")
    return String(value)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  return String(value);
}
