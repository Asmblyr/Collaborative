import type { Knex } from "knex";
import {
  parseSystemRelation,
  type CustomFieldDefinition,
} from "./relations.js";
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

export async function parseCustomFieldConfiguration(
  db: Knex.Transaction,
  name: string,
  body: unknown,
  current?: CustomFieldRow,
): Promise<{
  definition: CustomFieldDefinition;
  presentation: FieldPresentation | Record<string, never>;
}> {
  const input = objectInput(body, ["field", "presentation"]);
  if (!Object.keys(input).length) {
    throw new CollectionInputError("Expected field configuration");
  }
  const allowedFieldKeys = current
    ? ["required", "nullable", "defaultValue"]
    : [
        "name",
        "type",
        "required",
        "nullable",
        "defaultValue",
        "targetCollection",
      ];
  if (input.field !== undefined) {
    objectInput(input.field, allowedFieldKeys);
  }
  let definition: CustomFieldDefinition;
  if (current) {
    const update =
      input.field === undefined ? {} : parseUpdateField(input.field);
    const { relation, ...scalar } = current.definition;
    const draft = { ...scalar, ...update };
    if (draft.defaultValue === null) {
      delete draft.defaultValue;
    }
    definition = { ...parseField(draft), ...(relation ? { relation } : {}) };
  } else {
    const field = objectInput(input.field, allowedFieldKeys);
    definition =
      field.type === "relation"
        ? await parseSystemRelation(db, field)
        : parseField(field);
  }
  if (definition.name !== name) {
    throw new CollectionInputError("Field name does not match URL");
  }
  if (definition.required || !definition.nullable) {
    throw new CollectionInputError(
      "Custom system fields must remain optional and nullable so native operations can create records",
    );
  }
  if (definition.relation && definition.defaultValue !== undefined) {
    throw new CollectionInputError(
      "Custom system relations cannot have a default value",
    );
  }
  const presentation = parseFieldPresentation(
    input.presentation === undefined
      ? (current?.presentation ?? {})
      : input.presentation,
    definition.relation ? "relation" : definition.type,
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
