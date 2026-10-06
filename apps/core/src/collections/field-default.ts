import { parseItemId } from "../items/validation.js";
import type { EditableField } from "./editable-field.js";
import { parseFieldPresentation } from "./field-presentation-validation.js";
import { parsePresentedValue } from "./presented-value.js";
import type { JsonValue } from "./structured-values.js";
import {
  CollectionInputError,
  parseDefaultValue,
  type UpdateFieldInput,
} from "./validation.js";

export function normalizeFieldDefault(
  current: EditableField,
  name: string,
  update: UpdateFieldInput,
  presentationInput?: unknown,
): JsonValue {
  const type = current.relation_key_type
    ? "relation"
    : (current.type ?? current.data_type);
  const presentation =
    presentationInput === undefined
      ? current.presentation
      : parseFieldPresentation(presentationInput, type);
  const value =
    update.defaultValue === undefined
      ? current.default_value
      : update.defaultValue;
  if (value === null) return null;
  if (current.presentation?.sensitive)
    throw new CollectionInputError("Sensitive fields do not support defaults");

  if (current.type === "file" || current.type === "files") {
    throw new CollectionInputError("File fields do not support defaults");
  }

  const required = update.required ?? current.required;
  try {
    if (
      typeof value === "string" &&
      current.character_maximum_length !== null &&
      Array.from(value).length > current.character_maximum_length
    ) {
      throw new Error(`Default exceeds the database length limit: ${name}`);
    }
    if (current.relation_key_type) {
      // FK values follow the target key contract, including bigint and manual text IDs.
      if (typeof value !== "string" && typeof value !== "number") {
        throw new Error(`Invalid relation default: ${name}`);
      }
      if (typeof value === "number" && !Number.isSafeInteger(value)) {
        throw new Error(`Invalid relation default: ${name}`);
      }
      return parseItemId(String(value), current.relation_key_type);
    }
    const normalized = parseDefaultValue(current.type, name, required, value);
    return parsePresentedValue(normalized, presentation ?? undefined, required);
  } catch (error) {
    throw new CollectionInputError(
      error instanceof Error ? error.message : "Invalid field default",
    );
  }
}
