import type { ItemValue } from "@/components/items/types";
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

export function defaultPayload(type: string, value: string): ItemValue {
  if (type === "json") {
    try {
      const parsed = JSON.parse(value);
      if (parsed === null) throw new Error();
      return parsed;
    } catch {
      throw new InvalidDefaultError(
        "Введите JSON для default (NULL задаётся отдельно)",
      );
    }
  }
  if (type === "integer") {
    const parsed = Number(value);
    if (value.trim() === "" || !Number.isInteger(parsed))
      throw new InvalidDefaultError("Введите целое число для default");
    return parsed;
  }
  if (type === "boolean") {
    if (value !== "true" && value !== "false")
      throw new InvalidDefaultError("Выберите значение для default");
    return value === "true";
  }
  if (type === "datetime") {
    const parsed = new Date(`${value}Z`);
    if (
      Number.isNaN(parsed.valueOf()) ||
      !parsed.toISOString().startsWith(value)
    ) {
      throw new InvalidDefaultError(
        "Введите корректные дату и время для default",
      );
    }
    return parsed.toISOString();
  }
  return value;
}
