import {
  parseCalendarDate,
  parseBigintString,
} from "@asmblyr-collaborative/contracts";
import type { ItemValue } from "@/components/items/types";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export class InvalidDefaultError extends Error {}

export function defaultInput(
  value: ItemValue | undefined,
  type: string,
): string {
  if (value === undefined) return "";
  return type === "json"
    ? JSON.stringify(value)
    : type === "datetime" && typeof value === "string"
      ? value.slice(0, 19)
      : String(value);
}

export function defaultPayload(
  type: string,
  value: string,
  copy: UiCopy = originalCopy,
): ItemValue {
  if (type === "json") {
    try {
      const parsed = JSON.parse(value);
      if (parsed === null) throw new Error();
      return parsed;
    } catch {
      throw new InvalidDefaultError(
        copy("Введите JSON для default (NULL задаётся отдельно)"),
      );
    }
  }
  if (type === "date") return parseCalendarDate(value);
  if (type === "bigint") return parseBigintString(value);
  if (type === "integer") {
    const parsed = Number(value);
    if (value.trim() === "" || !Number.isInteger(parsed))
      throw new InvalidDefaultError(copy("Введите целое число для default"));
    return parsed;
  }
  if (type === "boolean") {
    if (value !== "true" && value !== "false")
      throw new InvalidDefaultError(copy("Выберите значение для default"));
    return value === "true";
  }
  if (type === "datetime") {
    const parsed = new Date(`${value}Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      !parsed.toISOString().startsWith(value)
    ) {
      throw new InvalidDefaultError(
        copy("Введите корректные дату и время для default"),
      );
    }
    return parsed.toISOString();
  }
  return value;
}
