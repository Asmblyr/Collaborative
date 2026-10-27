import type { ToolDefinition } from "./tool-definitions.js";

const collection = { type: "string", maxLength: 63 };
const values = {
  type: "object",
  additionalProperties: true,
  maxProperties: 50,
};
const id = { type: "string", minLength: 1, maxLength: 255 };
const operationId = {
  type: "string",
  minLength: 16,
  maxLength: 128,
  description:
    "Unique operation ID. Reuse the SAME ID and exact arguments after a timeout; never generate a second ID to retry a write.",
};

function definition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  readOnly: boolean,
): ToolDefinition {
  return {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      additionalProperties: false,
      required: Object.keys(properties),
    },
    annotations: {
      readOnlyHint: readOnly,
      destructiveHint: !readOnly,
      openWorldHint: false,
    },
  };
}

export const writeToolDefinitions = [
  definition(
    "create_item",
    "Create one record using current user permissions and normal validation. Describe the collection first; use technical field names and scalar relation IDs. Reuse operationId on retry. No nested records, deletion or schema changes. Returns a record link, not unrestricted field values.",
    { collection, values, operationId },
    false,
  ),
  definition(
    "prepare_update",
    "Read original values for the fields to be changed, check field access and prepare a conflict-safe update. Describe the collection first. Pass the returned expectedValues unchanged to update_item. This does not modify data or authorize a later write.",
    { collection, id, values },
    true,
  ),
  definition(
    "update_item",
    "Update one record with the exact expectedValues returned by prepare_update and a stable operationId. Current row, field, relation and MCP permissions are checked again. ITEM_CHANGED means reread/review; never silently retry with new originals. No deletion or schema changes.",
    { collection, id, values, expectedValues: values, operationId },
    false,
  ),
];
