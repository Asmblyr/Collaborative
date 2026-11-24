import { InputError, objectInput } from "../shared/input.js";
import { parseTermIds } from "../terms/validation.js";
import { ToolArgumentError } from "./errors.js";
import { parseToolSearch } from "./search-input.js";

export type DataTool = "search_items" | "read_item" | "count_items";

export interface QueryDefaults {
  q: string;
  filter: string;
  sort: string;
  direction: "asc" | "desc";
  order?: import("@asmblyr-collaborative/contracts").ItemOrder;
}

interface FilterQuery {
  q: string;
  filter?: string;
  terms?: string[];
}

interface SearchQuery extends FilterQuery {
  page: string;
  limit: string;
  sort: string;
  direction: "asc" | "desc";
  order?: import("@asmblyr-collaborative/contracts").ItemOrder;
}

export type DataToolInput =
  | { tool: "read_item"; id: string; fields: string[] }
  | { tool: "count_items"; query: FilterQuery }
  | { tool: "search_items"; fields: string[]; query: SearchQuery };

const allowedArgumentNames: Record<DataTool, string[]> = {
  read_item: ["id", "fields"],
  count_items: ["q", "filter", "terms"],
  search_items: [
    "q",
    "filter",
    "terms",
    "fields",
    "limit",
    "page",
    "sort",
    "direction",
    "order",
  ],
};

const requiredArgumentNames: Record<DataTool, string[]> = {
  read_item: ["id", "fields"],
  count_items: [],
  search_items: ["fields"],
};

export function isDataTool(name: string): name is DataTool {
  return Object.hasOwn(allowedArgumentNames, name);
}

function invalidArgument(
  argument: string,
  reason: string,
  hint?: string,
): never {
  throw new ToolArgumentError(
    "INVALID_ARGUMENTS",
    hint ?? `Fix argument "${argument}": ${reason}.`,
    [argument],
    `Invalid argument "${argument}": ${reason}.`,
  );
}

function parseFields(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    return invalidArgument(
      "fields",
      "expected array of 1..12 field names",
      'Pass "fields" as a non-empty array of 1..12 unique readable field names from describe_collection.',
    );
  }

  const fields: string[] = [];
  for (const field of value) {
    if (typeof field !== "string") {
      return invalidArgument(
        "fields",
        "every field name must be a string",
        'Pass "fields" as an array of technical field names (strings) from describe_collection.',
      );
    }
    if (fields.includes(field)) {
      return invalidArgument(
        "fields",
        "duplicate field names are not allowed",
        'Remove duplicate entries from "fields".',
      );
    }
    fields.push(field);
  }
  return fields;
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  argument: string,
): number {
  const resolved = value === undefined || value === null ? fallback : value;
  if (typeof resolved !== "number" || !Number.isInteger(resolved)) {
    return invalidArgument(
      argument,
      `expected an integer between 1 and ${maximum}`,
    );
  }
  if (resolved < 1 || resolved > maximum) {
    return invalidArgument(
      argument,
      `expected an integer between 1 and ${maximum}`,
    );
  }
  return resolved;
}

// Explicit null (or omitted optional key) inherits the page setting. Empty text clears search/filter.
function parseInheritedText(
  value: unknown,
  fallback: string,
  maxLength: number,
  argument: string,
  hint?: string,
): string {
  const resolved = value === null || value === undefined ? fallback : value;
  if (typeof resolved !== "string" || resolved.length > maxLength) {
    return invalidArgument(
      argument,
      `expected a string of at most ${maxLength} characters or null`,
      hint,
    );
  }
  return resolved;
}

function parseFilterQuery(
  body: Record<string, unknown>,
  table: QueryDefaults,
): FilterQuery {
  const q = parseToolSearch(body.q === undefined ? null : body.q, table.q);
  const filter = parseInheritedText(
    body.filter,
    table.filter,
    8192,
    "filter",
    'Pass "filter" as a JSON logic/children string, "" to clear, or null to inherit defaults.',
  );
  let terms: string[];
  try {
    terms = parseTermIds(body.terms ?? null);
  } catch (error) {
    if (error instanceof InputError) {
      return invalidArgument(
        "terms",
        "expected null or an array of up to 5 unique term UUIDs",
        'Pass "terms" as null or an array of up to 5 unique term IDs from describe_collection.',
      );
    }
    throw error;
  }
  return { q, filter: filter || undefined, ...(terms.length ? { terms } : {}) };
}

function parseSearchQuery(
  body: Record<string, unknown>,
  table: QueryDefaults,
): SearchQuery {
  const page = parsePositiveInteger(body.page, 1, 50, "page");
  const limit = parsePositiveInteger(body.limit, 20, 20, "limit");
  const sort = parseInheritedText(
    body.sort,
    table.sort,
    63,
    "sort",
    'Pass "sort" as a readable physical field name or null to inherit default sort.',
  );
  const direction = parseInheritedText(
    body.direction,
    table.direction,
    4,
    "direction",
    'Pass "direction" as "asc", "desc", or null.',
  );

  const q = parseToolSearch(body.q === undefined ? null : body.q, table.q);
  let order = body.order;
  if (order === null || order === undefined) {
    const inheritsSort = body.sort == null && body.direction == null;
    order = inheritsSort
      ? (table.order ?? (q ? "relevance" : "field"))
      : "field";
  }
  if (order !== "field" && order !== "relevance") {
    return invalidArgument(
      "order",
      'expected "field", "relevance", or null',
      'Pass "order" as "field", "relevance", or null.',
    );
  }

  if (direction !== "asc" && direction !== "desc") {
    return invalidArgument(
      "direction",
      'expected "asc", "desc", or null',
      'Pass "direction" as "asc", "desc", or null.',
    );
  }

  return {
    ...parseFilterQuery(body, table),
    page: String(page),
    limit: String(limit),
    sort,
    direction,
    order,
  };
}

export function parseDataToolInput(
  tool: DataTool,
  args: unknown,
  table: QueryDefaults,
): DataToolInput {
  const allowedKeys = allowedArgumentNames[tool];
  const body = objectInput(args, allowedKeys);
  const missing = requiredArgumentNames[tool].filter(
    (key) => !Object.hasOwn(body, key) || body[key] === undefined,
  );

  if (missing.length) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      `Provide required argument(s): ${missing.join(", ")}.`,
      missing,
      `Missing required argument(s): ${missing.join(", ")}.`,
    );
  }

  switch (tool) {
    case "read_item": {
      if (typeof body.id !== "string" || body.id.length > 255) {
        return invalidArgument(
          "id",
          "expected a string of at most 255 characters",
        );
      }
      return { tool, id: body.id, fields: parseFields(body.fields) };
    }
    case "count_items":
      return { tool, query: parseFilterQuery(body, table) };
    case "search_items":
      return {
        tool,
        fields: parseFields(body.fields),
        query: parseSearchQuery(body, table),
      };
  }
}
