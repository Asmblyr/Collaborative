import { z } from "@asmblyr/kit/actions";
import type {
  PluginSettingField,
  PluginSettingsDefinition,
  PluginSettingsValues,
} from "@asmblyr/contracts";
import { EndpointError } from "@asmblyr/kit";

const label = {
  label: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
};
const field = z.discriminatedUnion("type", [
  z.strictObject({
    ...label,
    type: z.literal("boolean"),
    default: z.boolean(),
  }),
  z.strictObject({
    ...label,
    type: z.literal("string"),
    default: z.string(),
    maxLength: z.number().int().min(1).max(10000),
  }),
  z.strictObject({
    ...label,
    type: z.literal("number"),
    default: z.number(),
    min: z.number(),
    max: z.number(),
    integer: z.boolean().optional(),
  }),
  z.strictObject({
    ...label,
    type: z.literal("select"),
    default: z.string(),
    options: z
      .array(
        z.strictObject({
          value: z.string().min(1).max(100),
          label: z.string().min(1).max(120),
        }),
      )
      .min(1)
      .max(50),
  }),
]);
const definitionSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  fields: z.record(
    z
      .string()
      .regex(/^[a-z][a-zA-Z0-9_]{0,63}$/)
      .refine(
        (key) => !["constructor", "prototype", "__proto__"].includes(key),
      ),
    field,
  ),
});

function validValue(field: PluginSettingField, value: unknown): boolean {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string" && value.length <= field.maxLength;
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= field.min &&
        value <= field.max &&
        (!field.integer || Number.isSafeInteger(value))
      );
    case "select":
      return (
        typeof value === "string" &&
        field.options.some((entry) => entry.value === value)
      );
  }
}

export function parseSettingsDefinition(
  value: unknown,
): PluginSettingsDefinition {
  const definition = definitionSchema.parse(value);
  const fields = Object.values(definition.fields);
  if (!fields.length || fields.length > 40) {
    throw new Error("Declare 1–40 plugin settings");
  }
  for (const field of fields) {
    if (!validValue(field, field.default)) {
      throw new Error(`Invalid default: ${field.label}`);
    }
    if (
      field.type === "select" &&
      new Set(field.options.map((entry) => entry.value)).size !==
        field.options.length
    ) {
      throw new Error(`Duplicate setting options: ${field.label}`);
    }
  }
  return definition;
}

export function validateSettingsValues(
  definition: PluginSettingsDefinition,
  input: unknown,
): PluginSettingsValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new EndpointError(
      400,
      "PLUGIN_SETTINGS_INVALID",
      "Ожидается объект настроек",
    );
  }
  const values = input as Record<string, unknown>;
  if (
    Object.keys(values).some((key) => !Object.hasOwn(definition.fields, key))
  ) {
    throw new EndpointError(
      400,
      "PLUGIN_SETTINGS_INVALID",
      "Неизвестная настройка плагина",
    );
  }
  const result: PluginSettingsValues = {};
  for (const [key, field] of Object.entries(definition.fields)) {
    const value = values[key];
    if (!Object.hasOwn(values, key) || !validValue(field, value)) {
      throw new EndpointError(
        400,
        "PLUGIN_SETTINGS_INVALID",
        `Недопустимое значение: ${field.label}`,
      );
    }
    result[key] = value as PluginSettingsValues[string];
  }
  if (JSON.stringify(result).length > 32_000) {
    throw new EndpointError(
      400,
      "PLUGIN_SETTINGS_INVALID",
      "Настройки слишком велики",
    );
  }
  return result;
}

export function resolveSettingsValues(
  definition: PluginSettingsDefinition,
  saved: PluginSettingsValues = {},
): PluginSettingsValues {
  const values = Object.fromEntries(
    Object.entries(definition.fields).map(([key, field]) => [
      key,
      Object.hasOwn(saved, key) ? saved[key] : field.default,
    ]),
  );
  return validateSettingsValues(definition, values);
}
