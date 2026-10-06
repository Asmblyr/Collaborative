import {
  parseCalendarDate,
  parseBigintString,
  parseTags,
} from "@asmblyr-collaborative/contracts";
import type { CollectionField, Item, ItemValue } from "./types";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";
import { tagErrorMessage } from "./tag-values";

export function inputValue(field: CollectionField, item?: Item): string {
  const value = item?.[field.name];
  if (value == null) return "";
  if (field.type === "datetime" && typeof value === "string")
    return value.slice(0, 19);
  if (field.type === "json" || field.type === "files")
    return JSON.stringify(value);
  return String(value);
}

export function payloadValue(
  field: CollectionField,
  value: string,
  copy: UiCopy = originalCopy,
): ItemValue {
  if (value === "") {
    if (field.nullable && !field.required) return null;
    throw new Error(
      copy("Заполните поле {{value0}}", {
        value0: field.presentation?.label || field.name,
      }),
    );
  }
  if (field.type === "date") return parseCalendarDate(value);
  if (field.type === "bigint") return parseBigintString(value);
  if (field.type === "integer") return Number(value);
  if (field.type === "boolean") return value === "true";
  if (field.type === "json" || field.type === "files") {
    let parsed: ItemValue;
    try {
      parsed = JSON.parse(value) as ItemValue;
    } catch {
      throw new Error(
        copy("Некорректный JSON в поле {{value0}}", {
          value0: field.presentation?.label || field.name,
        }),
      );
    }
    if (field.presentation?.interface === "tags") {
      if (parsed === null && field.nullable && !field.required) {
        return null;
      }
      try {
        return parseTags(parsed, field.required);
      } catch (error) {
        throw new Error(tagErrorMessage(error, copy));
      }
    }
    return parsed;
  }
  if (field.type === "datetime") {
    const date = new Date(`${value}Z`);
    if (Number.isNaN(date.valueOf()) || !date.toISOString().startsWith(value))
      throw new Error(copy("Некорректная дата и время"));
    return date.toISOString();
  }
  // Decimal stays a string to preserve PostgreSQL numeric precision.
  return value;
}

export function arrayDraft(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
