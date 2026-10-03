import type { RepeaterSettings } from "@asmblyr/contracts";
export type { RepeaterField, RepeaterSettings } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";
import { parseFieldValue } from "./field-values.js";
import { parseContentValue } from "./content-values.js";
import type { JsonValue } from "./structured-values.js";

export function parseRepeater(value: unknown): RepeaterSettings {
  const fail = (): never => {
    throw new CollectionInputError(
      "Invalid repeater: use 1–24 named scalar fields and 0–200 rows",
    );
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const input = value as RepeaterSettings;
  if (
    Object.keys(input).some(
      (key) => !["fields", "labelField", "minItems", "maxItems"].includes(key),
    ) ||
    !Array.isArray(input.fields) ||
    !input.fields.length ||
    input.fields.length > 24 ||
    !Number.isInteger(input.minItems) ||
    !Number.isInteger(input.maxItems) ||
    input.minItems < 0 ||
    input.maxItems < Math.max(1, input.minItems) ||
    input.maxItems > 200
  )
    return fail();
  const names = new Set<string>();
  const fields = input.fields.map((field) => {
    if (
      !field ||
      typeof field !== "object" ||
      Array.isArray(field) ||
      Object.keys(field).some(
        (key) =>
          ![
            "name",
            "label",
            "type",
            "interface",
            "required",
            "width",
            "options",
          ].includes(key),
      ) ||
      typeof field.name !== "string" ||
      !/^[a-z][a-z0-9_]{0,62}$/.test(field.name) ||
      ["constructor", "prototype", "__proto__"].includes(field.name) ||
      names.has(field.name) ||
      typeof field.label !== "string" ||
      field.label.length > 120 ||
      field.label.includes("\0") ||
      !["text", "email", "integer", "decimal", "boolean", "datetime"].includes(
        field.type,
      ) ||
      !["auto", "textarea", "markdown", "url", "select"].includes(
        field.interface,
      ) ||
      (field.interface !== "auto" && field.type !== "text") ||
      typeof field.required !== "boolean" ||
      !["full", "half"].includes(field.width)
    )
      return fail();
    names.add(field.name);
    if (field.interface === "select") {
      if (
        !Array.isArray(field.options) ||
        !field.options.length ||
        field.options.length > 100 ||
        field.options.some(
          (o) =>
            !o ||
            typeof o !== "object" ||
            Object.keys(o).some((k) => !["value", "label"].includes(k)) ||
            typeof o.value !== "string" ||
            !o.value.trim() ||
            o.value.length > 120 ||
            o.value.includes("\0") ||
            typeof o.label !== "string" ||
            !o.label.trim() ||
            o.label.length > 120 ||
            o.label.includes("\0"),
        ) ||
        new Set(field.options.map((o) => o.value)).size !== field.options.length
      )
        return fail();
    } else if (field.options !== undefined) return fail();
    return { ...field, label: field.label.trim() };
  });
  if (input.labelField !== null && !names.has(input.labelField)) return fail();
  return { ...input, fields };
}

export function parseRepeaterValue(
  value: JsonValue,
  settings: RepeaterSettings,
  required = false,
): JsonValue {
  if (
    !Array.isArray(value) ||
    value.length < Math.max(settings.minItems, required ? 1 : 0) ||
    value.length > settings.maxItems
  ) {
    throw new Error(
      `Repeater requires ${Math.max(settings.minItems, required ? 1 : 0)}–${settings.maxItems} rows`,
    );
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error(`Repeater row ${index + 1} must be an object`);
    // Preserve legacy/unknown properties; changing the interface is not a data migration.
    const result = { ...row };
    for (const field of settings.fields) {
      const raw = Object.hasOwn(row, field.name) ? row[field.name] : undefined;
      if (raw === null || raw === undefined) {
        if (field.required)
          throw new Error(
            `Row ${index + 1}: ${field.label || field.name} is required`,
          );
        continue;
      }
      try {
        const parsed = parseFieldValue(field, raw);
        if (
          field.interface === "select" &&
          !field.options?.some((o) => o.value === parsed)
        )
          throw new Error("Choose a configured option");
        result[field.name] =
          typeof parsed === "string" || typeof parsed === "number"
            ? parseContentValue(parsed, field, field.required)
            : parsed;
      } catch (cause) {
        throw new Error(
          `Row ${index + 1}, ${field.label || field.name}: ${cause instanceof Error ? cause.message : "Invalid value"}`,
        );
      }
    }
    return result;
  });
}
