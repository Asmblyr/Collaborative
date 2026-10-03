import { aggregateProperties } from "./aggregate-definition.js";

export interface ToolDefinition {
  name: string;
  description: string;
  annotations?: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    additionalProperties: false;
    required: string[];
  };
}

const collection = {
  type: "string",
  maxLength: 63,
  description:
    "Technical collection name from list_collections or page context.",
};
const scope = {
  terms: {
    type: ["array", "null"],
    items: { type: "string", format: "uuid" },
    maxItems: 5,
    description:
      "Term IDs from this collection's describe_collection. Core ANDs their current saved filters with filter and q. null means no terms. Never invent a term or its condition.",
  },
  q: {
    type: ["string", "null"],
    maxLength: 100,
    description:
      "Text search. Empty string clears search; null uses the caller's query defaults.",
  },
  filter: {
    type: ["string", "null"],
    maxLength: 8192,
    description:
      "JSON filter in validate_filter syntax. Empty string clears the filter; null uses the caller's query defaults.",
  },
};
const fields = {
  type: "array",
  items: { type: "string" },
  minItems: 1,
  maxItems: 12,
  description:
    "Explicit readable physical fields, no wildcard or nested paths. Primary key is always included. To-many arrays are not expanded.",
};

export const filterDescription = `Validate a filter without applying it or changing data.
filter is JSON text: {"logic":"and"|"or","children":[condition or nested group]}.
condition: {"field":"field or relation.field","op":"operator","value":"string or string[]","quantifier":"some or none, optional for to-many"}.
Operators: eq neq in notIn contains notContains containsCase notContainsCase startsWith notStartsWith startsWithCase notStartsWithCase endsWith notEndsWith endsWithCase notEndsWithCase gt gte lt lte between notBetween isNull notNull isEmpty notEmpty exists notExists.
All scalar values are strings, including numbers and booleans. in/notIn take 1-20 strings; between/notBetween exactly 2. Omit value for isNull/notNull/isEmpty/notEmpty/exists/notExists. exists/notExists require relation.primaryKey and no quantifier.
Max 20 conditions, 3 group levels, 8192 characters. One relation level only.`;

function define(
  name: string,
  description: string,
  properties: Record<string, unknown>,
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
  };
}

export const toolDefinitions: ToolDefinition[] = [
  define(
    "list_collections",
    "Find collections readable by the current user and enabled for MCP. Returns only names and descriptions, no records. Search matches technical and display names. Hidden navigation and workspaces do not grant or revoke access.",
    {
      q: { type: ["string", "null"], maxLength: 100 },
      page: { type: "integer", minimum: 1, maximum: 50 },
      limit: { type: "integer", minimum: 1, maximum: 20 },
    },
  ),
  define(
    "describe_collection",
    "Read permitted fields, types, M2O references, filter paths (one relation level), and configured business terms with their meanings and filters. Call for each collection before reading its data or validating filters. A partial result is not the full schema.",
    { collection },
  ),
  define(
    "search_items",
    "Search records in a permitted collection. Call describe_collection first. Bounded text previews preserve numeric precision; check truncatedFields and hasMore. Request only necessary fields. No relation expansion, file contents or total count.",
    {
      collection,
      ...scope,
      fields,
      limit: { type: "integer", minimum: 1, maximum: 20 },
      page: { type: "integer", minimum: 1, maximum: 50 },
      sort: {
        type: ["string", "null"],
        maxLength: 63,
        description:
          "Readable physical field; null uses the caller's default sort.",
      },
      direction: { type: ["string", "null"], enum: ["asc", "desc", null] },
    },
  ),
  define(
    "read_item",
    "Read by primary key, independent of table conditions. Call describe_collection first. Returns only permitted requested fields plus primary key, as bounded text previews. Check found and truncatedFields.",
    {
      collection,
      id: { type: "string", maxLength: 255 },
      fields,
    },
  ),
  define(
    "count_items",
    "Count matching records, returning an exact decimal string. Call describe_collection first. Queries can time out; never infer a count from errors.",
    { collection, ...scope },
  ),
  define("validate_filter", filterDescription, {
    collection,
    filter: { type: "string", maxLength: 8192 },
  }),
  define(
    "aggregate_items",
    "Aggregate all matching records in PostgreSQL with optional grouping. Call describe_collection first. Shares search, filters and business terms with count_items. Returns bounded groups, exact text metrics, per-group row counts and hasMore. Never sum a partial page to claim a grand total. To name a relation-key group, read the referenced permitted collection; do not guess its label.",
    { collection, ...scope, ...aggregateProperties },
  ),
];
