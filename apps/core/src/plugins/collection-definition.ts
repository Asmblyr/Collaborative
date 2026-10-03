import type { FieldPresentation } from "@asmblyr/contracts";
import { parseCreateCollection } from "../collections/create-validation.js";
import { parseFieldPresentation } from "../collections/field-presentation-validation.js";
import type { CreateCollectionInput } from "../collections/types.js";
import { parsePresentedValue } from "../collections/presented-value.js";
import { isRecord } from "./definition.js";

export interface PluginCollection {
  localName: string;
  input: CreateCollectionInput;
  presentation: Record<string, FieldPresentation | Record<string, never>>;
}

function assertKeys(
  value: unknown,
  keys: string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error(`Invalid plugin ${label}`);
  }
}

export function parsePluginCollection(
  value: unknown,
  namespace: string,
  localName: string,
): PluginCollection {
  assertKeys(
    value,
    ["name", "mode", "primaryKey", "timestamps", "presentation", "fields"],
    "collection declaration",
  );
  if (value.name !== localName)
    throw new Error(`Collection name must match its filename: ${localName}`);
  if (!isRecord(value.primaryKey) || !isRecord(value.fields)) {
    throw new Error("Plugin collection requires primaryKey and fields");
  }
  const display = value.presentation ?? {};
  assertKeys(display, ["displayName", "hidden"], "collection presentation");
  const presentation: PluginCollection["presentation"] = {};
  const fields = Object.entries(value.fields).map(([name, raw]) => {
    assertKeys(
      raw,
      [
        "type",
        "required",
        "nullable",
        "defaultValue",
        "searchable",
        "presentation",
      ],
      `field ${name}`,
    );
    if (
      typeof raw.required !== "boolean" ||
      typeof raw.nullable !== "boolean"
    ) {
      throw new Error(
        `Field ${name} requires explicit required and nullable booleans`,
      );
    }
    const { presentation: settings, ...field } = raw;
    if (settings !== undefined) {
      presentation[name] = parseFieldPresentation(settings, String(raw.type));
    }
    return { ...field, name };
  });
  // The existing parser validates local names, field values and managed-column collisions.
  const input = parseCreateCollection({
    name: localName,
    mode: value.mode,
    primaryKey: value.primaryKey,
    timestamps: value.timestamps,
    displayName: display.displayName,
    hidden: display.hidden,
    mcp: { enabled: false, description: null },
    fields,
  });
  const name = `plugin_${namespace}_${localName}`;
  for (const field of input.fields) {
    if (field.defaultValue !== undefined && presentation[field.name]) {
      parsePresentedValue(
        field.defaultValue,
        presentation[field.name],
        field.required,
      );
    }
  }
  if (name.length > 63)
    throw new Error(
      `Plugin collection name exceeds PostgreSQL's 63-character limit: ${name}`,
    );
  input.name = name;
  return { localName, input, presentation };
}
