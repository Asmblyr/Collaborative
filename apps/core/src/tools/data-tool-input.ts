import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { parseTermIds } from "../terms/validation.js";

export type DataTool = "search_items" | "read_item" | "count_items";

export interface QueryDefaults {
  q: string;
  filter: string;
  sort: string;
  direction: "asc" | "desc";
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
}

export type DataToolInput =
  | { tool: "read_item"; id: string; fields: string[] }
  | { tool: "count_items"; query: FilterQuery }
  | { tool: "search_items"; fields: string[]; query: SearchQuery };

const argumentNames: Record<DataTool, string[]> = {
  read_item: ["id", "fields"],
  count_items: ["q", "filter"],
  search_items: ["q", "filter", "fields", "limit", "page", "sort", "direction"],
};

export function isDataTool(name: string): name is DataTool {
  return Object.hasOwn(argumentNames, name);
}

function invalidArguments(): never {
  throw new ItemError("Invalid data tool arguments", 400);
}

function parseFields(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    return invalidArguments();
  }

  const fields: string[] = [];
  for (const field of value) {
    if (typeof field !== "string" || fields.includes(field)) {
      return invalidArguments();
    }
    fields.push(field);
  }
  return fields;
}

function parsePositiveInteger(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return invalidArguments();
  }
  if (value < 1 || value > maximum) {
    return invalidArguments();
  }
  return value;
}

// Explicit null inherits the page setting. Empty text clears search/filter.
function parseInheritedText(value: unknown, fallback: string, maxLength: number): string {
  const resolved = value === null ? fallback : value;
  if (typeof resolved !== "string" || resolved.length > maxLength) {
    return invalidArguments();
  }
  return resolved;
}

function parseFilterQuery(body: Record<string, unknown>, table: QueryDefaults): FilterQuery {
  const q = parseInheritedText(body.q, table.q, 100);
  const filter = parseInheritedText(body.filter, table.filter, 8192);
  const terms = parseTermIds(body.terms);
  return { q, filter: filter || undefined, ...(terms.length ? { terms } : {}) };
}

function parseSearchQuery(body: Record<string, unknown>, table: QueryDefaults): SearchQuery {
  const page = parsePositiveInteger(body.page, 50);
  const limit = parsePositiveInteger(body.limit, 20);
  const sort = parseInheritedText(body.sort, table.sort, 63);
  const direction = parseInheritedText(body.direction, table.direction, 4);

  if (direction !== "asc" && direction !== "desc") {
    return invalidArguments();
  }

  return {
    ...parseFilterQuery(body, table),
    page: String(page),
    limit: String(limit),
    sort,
    direction,
  };
}

export function parseDataToolInput(
  tool: DataTool,
  args: unknown,
  table: QueryDefaults,
): DataToolInput {
  const requiredKeys = argumentNames[tool];
  const allowedKeys = tool === "read_item" ? requiredKeys : [...requiredKeys, "terms"];
  const body = objectInput(args, allowedKeys);

  if (requiredKeys.some((key) => !Object.hasOwn(body, key))) {
    return invalidArguments();
  }

  switch (tool) {
    case "read_item": {
      if (typeof body.id !== "string" || body.id.length > 255) {
        return invalidArguments();
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
