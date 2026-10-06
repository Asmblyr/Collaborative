import type { CollectionField } from "../collections/types.js";
import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import { objectInput } from "../shared/input.js";
import {
  parseField,
  parseUpdateField,
  parseMutableFieldName,
  CollectionInputError,
} from "../collections/validation.js";
import { parseFieldPresentation } from "../collections/field-presentation-validation.js";
import { parsePresentedValue } from "../collections/presented-value.js";
import type { CustomFieldRow } from "./repository.js";

export function parseCustomFieldName(value: string): string {
  const name = parseMutableFieldName(value);
  if (
    /^(asmblyr_|plugin_)/i.test(name) ||
    ["constructor", "prototype"].includes(name)
  ) {
    throw new CollectionInputError("Reserved field name");
  }
  return name;
}

export function parseCustomFieldConfiguration(
  name: string,
  body: unknown,
  current?: CustomFieldRow,
): {
  definition: CollectionField;
  presentation: FieldPresentation | Record<string, never>;
} {
  const input = objectInput(body, ["field", "presentation"]);
  if (!Object.keys(input).length) {
    throw new CollectionInputError("Expected field configuration");
  }
  const allowedFieldKeys = current
    ? ["required", "nullable", "defaultValue"]
    : ["name", "type", "required", "nullable", "defaultValue"];
  if (input.field !== undefined) {
    objectInput(input.field, allowedFieldKeys);
  }
  let definition: CollectionField;
  if (current) {
    const update =
      input.field === undefined ? {} : parseUpdateField(input.field);
    const draft = { ...current.definition, ...update };
    if (draft.defaultValue === null) {
      delete draft.defaultValue;
    }
    definition = parseField(draft);
  } else {
    definition = parseField(input.field);
  }
  if (definition.name !== name) {
    throw new CollectionInputError("Field name does not match URL");
  }
  if (definition.required || !definition.nullable) {
    throw new CollectionInputError(
      "Custom system fields must remain optional and nullable so native operations can create records",
    );
  }
  const presentation = parseFieldPresentation(
    input.presentation === undefined
      ? (current?.presentation ?? {})
      : input.presentation,
    definition.type,
  );
  if (
    presentation.rules ||
    presentation.sensitive ||
    presentation.relationFilter
  ) {
    throw new CollectionInputError(
      "Custom system fields do not support behavior rules or sensitive-history settings",
    );
  }
  if (definition.defaultValue !== undefined) {
    definition.defaultValue = parsePresentedValue(
      definition.defaultValue,
      presentation,
      false,
    );
  }
  // Search remains owned by each native entity, not by the generic items engine.
  delete definition.searchable;
  return { definition, presentation };
}
