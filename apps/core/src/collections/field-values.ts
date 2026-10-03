import type { FieldType } from "./types.js";
import {
  parseDecimal,
  parseFileIds,
  parseJsonValue,
  type JsonValue,
} from "./structured-values.js";

const datetimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/;
const emailPattern = /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)+$/u;

function parseDatetime(value: unknown, name: string): string {
  if (typeof value !== "string")
    throw new Error(`Invalid datetime for field: ${name}`);
  const match = datetimePattern.exec(value);
  if (!match) throw new Error(`Invalid datetime for field: ${name}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(0, 0, 0, 0);
  if (
    year === 0 ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new Error(`Invalid datetime for field: ${name}`);
  }

  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf()))
    throw new Error(`Invalid datetime for field: ${name}`);
  return instant.toISOString();
}

export function parseFieldValue(
  field: { name: string; type: FieldType | null; required: boolean },
  value: unknown,
): JsonValue {
  switch (field.type) {
    case "uuid":
      if (
        typeof value === "string" &&
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
      ) {
        return value.toLowerCase();
      }
      break;
    case "text":
      if (
        typeof value === "string" &&
        (!field.required || value.trim().length > 0)
      )
        return value;
      break;
    case "email":
      if (
        typeof value === "string" &&
        value.length <= 254 &&
        !/\s/u.test(value) &&
        emailPattern.test(value)
      )
        return value;
      break;
    case "integer":
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= -2147483648 &&
        value <= 2147483647
      )
        return value;
      break;
    case "boolean":
      if (typeof value === "boolean") return value;
      break;
    case "datetime":
      return parseDatetime(value, field.name);
    case "decimal":
      return parseDecimal(value);
    case "json":
      return parseJsonValue(value);
    case "file":
    case "files":
      return parseFileIds(value, field.type === "files", field.required);
  }
  throw new Error(`Invalid value for field: ${field.name}`);
}
