export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function parseJsonValue(value: unknown): JsonValue {
  let nodes = 0;
  function valid(input: unknown, depth: number): boolean {
    if (++nodes > 5000 || depth > 8) return false;
    if (
      input === null ||
      typeof input === "string" ||
      typeof input === "boolean"
    )
      return true;
    if (typeof input === "number") return Number.isFinite(input);
    if (Array.isArray(input)) return input.every((v) => valid(v, depth + 1));
    return (
      typeof input === "object" &&
      input !== null &&
      Object.values(input).every((v) => valid(v, depth + 1))
    );
  }
  if (!valid(value, 0) || JSON.stringify(value).length > 65536)
    throw new Error("Invalid or oversized JSON value");
  return value as JsonValue;
}

/** numeric(30,10) stays a string through API, history and forms to preserve precision. */
export function parseDecimal(value: unknown): string {
  const text =
    typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (
    typeof text !== "string" ||
    !/^-?(?:0|[1-9]\d{0,19})(?:\.\d{1,10})?$/.test(text)
  ) {
    throw new Error(
      "Expected a decimal with up to 20 integer and 10 fractional digits",
    );
  }
  const [whole, fraction = ""] = text.split(".");
  const result = `${whole}.${fraction.padEnd(10, "0")}`;
  return /^-0\.0+$/.test(result) ? result.slice(1) : result;
}

export function parseFileIds(
  value: unknown,
  multiple: boolean,
  required: boolean,
): string | string[] {
  const values = multiple ? value : [value];
  if (
    !Array.isArray(values) ||
    values.length > 100 ||
    (required && !values.length) ||
    values.some(
      (v) =>
        typeof v !== "string" ||
        !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v),
    )
  ) {
    throw new Error("Expected file UUIDs (at most 100)");
  }
  const ids = values.map((v: string) => v.toLowerCase());
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate files are not allowed");
  return multiple ? ids : ids[0];
}
