import { InputError, objectInput } from "../shared/input.js";
import { parseDataToolInput } from "./data-tool-input.js";
import { ToolArgumentError } from "./errors.js";

export const aggregateOperations = [
  "count",
  "count_distinct",
  "sum",
  "avg",
  "min",
  "max",
] as const;
export type AggregateOperation = (typeof aggregateOperations)[number];
export interface AggregateMetric {
  operation: AggregateOperation;
  field: string | null;
}
export interface AggregateInput {
  query: { q: string; filter?: string; terms?: string[] };
  groupBy: string[];
  metrics: AggregateMetric[];
  orderBy: { metric: number; direction: "asc" | "desc" };
  page: number;
  limit: number;
}

function invalid(argument: string, reason: string, hint?: string): never {
  throw new ToolArgumentError(
    "INVALID_ARGUMENTS",
    hint ?? `Fix argument "${argument}": ${reason}.`,
    [argument],
    `Invalid argument "${argument}": ${reason}.`,
  );
}

function fieldName(value: unknown, argument: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    return invalid(
      argument,
      "expected direct physical field names without dots or SQL expressions",
    );
  }
  return value;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  argument: string,
): number {
  const resolved = value === undefined || value === null ? fallback : value;
  if (
    typeof resolved !== "number" ||
    !Number.isInteger(resolved) ||
    resolved < 1 ||
    resolved > maximum
  ) {
    return invalid(argument, `expected an integer between 1 and ${maximum}`);
  }
  return resolved;
}

function metric(value: unknown): AggregateMetric {
  let body: Record<string, unknown>;
  try {
    body = objectInput(value, ["operation", "field"]);
  } catch (error) {
    if (error instanceof InputError) {
      return invalid(
        "metrics",
        'each metric must be an object with only "operation" and "field"',
      );
    }
    throw error;
  }
  if (!aggregateOperations.includes(body.operation as AggregateOperation)) {
    return invalid(
      "metrics",
      `expected operation to be one of ${aggregateOperations.join(", ")}`,
    );
  }
  const operation = body.operation as AggregateOperation;
  if (body.field === null && operation === "count") {
    return { operation, field: null };
  }
  if (body.field === null || body.field === undefined) {
    return invalid(
      "metrics",
      'expected a physical field name ("field": null is only allowed for operation "count")',
    );
  }
  return { operation, field: fieldName(body.field, "metrics") };
}

export function parseAggregateInput(value: unknown): AggregateInput {
  const keys = [
    "q",
    "filter",
    "terms",
    "groupBy",
    "metrics",
    "orderBy",
    "page",
    "limit",
  ];
  const body = objectInput(value, keys);
  if (!Object.hasOwn(body, "metrics") || body.metrics === undefined) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Provide required argument "metrics" (array of 1..5 metric objects).',
      ["metrics"],
      "Missing required argument(s): metrics.",
    );
  }
  const scope = parseDataToolInput(
    "count_items",
    {
      q: body.q === undefined ? null : body.q,
      filter: body.filter === undefined ? null : body.filter,
      terms: body.terms === undefined ? null : body.terms,
    },
    {
      q: "",
      filter: "",
      sort: "id",
      direction: "asc",
    },
  );
  if (scope.tool !== "count_items") {
    return invalid("metrics", "invalid aggregate scope");
  }
  const rawGroupBy =
    body.groupBy === undefined || body.groupBy === null ? [] : body.groupBy;
  if (!Array.isArray(rawGroupBy) || rawGroupBy.length > 3) {
    return invalid("groupBy", "expected array of 0..3 direct field names");
  }
  const groupBy = rawGroupBy.map((entry) => fieldName(entry, "groupBy"));
  if (new Set(groupBy).size !== groupBy.length) {
    return invalid("groupBy", "duplicate field names are not allowed");
  }
  if (
    !Array.isArray(body.metrics) ||
    body.metrics.length < 1 ||
    body.metrics.length > 5
  ) {
    return invalid("metrics", "expected array of 1..5 metric objects");
  }
  const metrics = body.metrics.map(metric);
  if (
    new Set(metrics.map((entry) => `${entry.operation}:${entry.field}`))
      .size !== metrics.length
  ) {
    return invalid(
      "metrics",
      "duplicate operation/field pairs are not allowed",
    );
  }
  let orderBy: AggregateInput["orderBy"] = { metric: 0, direction: "desc" };
  if (body.orderBy !== null && body.orderBy !== undefined) {
    let order: Record<string, unknown>;
    try {
      order = objectInput(body.orderBy, ["metric", "direction"]);
    } catch (error) {
      if (error instanceof InputError) {
        return invalid(
          "orderBy",
          'expected null or an object with only "metric" and "direction"',
        );
      }
      throw error;
    }
    if (
      typeof order.metric !== "number" ||
      !Number.isInteger(order.metric) ||
      order.metric < 0 ||
      order.metric >= metrics.length
    ) {
      return invalid(
        "orderBy",
        `expected metric index to be an integer between 0 and ${metrics.length - 1}`,
      );
    }
    if (order.direction !== "asc" && order.direction !== "desc") {
      return invalid("orderBy", 'expected direction to be "asc" or "desc"');
    }
    orderBy = { metric: order.metric, direction: order.direction };
  }
  const page = positiveInteger(body.page, 1, 50, "page");
  if (!groupBy.length && page !== 1) {
    return invalid("page", "must be 1 when groupBy is empty");
  }
  return {
    query: scope.query,
    groupBy,
    metrics,
    orderBy,
    page,
    limit: positiveInteger(body.limit, 20, 20, "limit"),
  };
}
