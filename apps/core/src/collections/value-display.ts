import type { ValueDisplay } from "@asmblyr/contracts";
export type { ValueDisplay } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";

export function parseValueDisplay(value: unknown, type: string): ValueDisplay {
  const fail = (): never => {
    throw new CollectionInputError("Invalid or incompatible value display");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const input = value as ValueDisplay;
  const only = (keys: string[]) =>
    Object.keys(input).every((k) => keys.includes(k));
  if (
    input.kind === "status" &&
    ["text", "integer", "boolean"].includes(type) &&
    only(["kind", "statuses"])
  ) {
    if (
      !Array.isArray(input.statuses) ||
      !input.statuses.length ||
      input.statuses.length > 100 ||
      input.statuses.some(
        (s) =>
          !s ||
          typeof s !== "object" ||
          Object.keys(s).some(
            (k) => !["value", "label", "color"].includes(k),
          ) ||
          typeof s.value !== "string" ||
          !s.value.trim() ||
          s.value.length > 120 ||
          s.value.includes("\0") ||
          typeof s.label !== "string" ||
          !s.label.trim() ||
          s.label.length > 120 ||
          s.label.includes("\0") ||
          !["gray", "blue", "green", "amber", "red", "violet"].includes(
            s.color,
          ),
      ) ||
      new Set(input.statuses.map((s) => s.value)).size !== input.statuses.length
    )
      return fail();
    return input;
  }
  if (
    input.kind === "number" &&
    ["integer", "decimal"].includes(type) &&
    only(["kind", "decimals", "grouping", "prefix", "suffix"])
  ) {
    if (
      !Number.isInteger(input.decimals) ||
      input.decimals < 0 ||
      input.decimals > 20 ||
      typeof input.grouping !== "boolean" ||
      typeof input.prefix !== "string" ||
      input.prefix.length > 20 ||
      input.prefix.includes("\0") ||
      typeof input.suffix !== "string" ||
      input.suffix.length > 20 ||
      input.suffix.includes("\0")
    )
      return fail();
    return input;
  }
  if (
    input.kind === "date" &&
    type === "datetime" &&
    only(["kind", "format", "timeZone"])
  ) {
    if (
      !["date", "datetime", "time"].includes(input.format) ||
      typeof input.timeZone !== "string" ||
      input.timeZone.length > 100
    )
      return fail();
    try {
      new Intl.DateTimeFormat("ru", { timeZone: input.timeZone });
    } catch {
      return fail();
    }
    return input;
  }
  return fail();
}
