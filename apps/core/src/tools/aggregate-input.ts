import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { parseDataToolInput } from "./data-tool-input.js";

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

function invalid(): never {
  throw new ItemError("Invalid aggregate arguments", 400);
}

function fieldName(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,62}$/.test(value))
    return invalid();
  return value;
}

function positiveInteger(value: unknown, maximum: number): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > maximum
  )
    return invalid();
  return value;
}

function metric(value: unknown): AggregateMetric {
  const body = objectInput(value, ["operation", "field"]);
  if (!aggregateOperations.includes(body.operation as AggregateOperation))
    return invalid();
  const operation = body.operation as AggregateOperation;
  if (body.field === null && operation === "count")
    return { operation, field: null };
  return { operation, field: fieldName(body.field) };
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
  if (keys.some((key) => !Object.hasOwn(body, key))) return invalid();
  const scope = parseDataToolInput(
    "count_items",
    { q: body.q, filter: body.filter, terms: body.terms },
    {
      q: "",
      filter: "",
      sort: "id",
      direction: "asc",
    },
  );
  if (scope.tool !== "count_items") return invalid();
  if (!Array.isArray(body.groupBy) || body.groupBy.length > 3) return invalid();
  const groupBy = body.groupBy.map(fieldName);
  if (new Set(groupBy).size !== groupBy.length) return invalid();
  if (
    !Array.isArray(body.metrics) ||
    body.metrics.length < 1 ||
    body.metrics.length > 5
  )
    return invalid();
  const metrics = body.metrics.map(metric);
  if (
    new Set(metrics.map((entry) => `${entry.operation}:${entry.field}`))
      .size !== metrics.length
  )
    return invalid();
  let orderBy: AggregateInput["orderBy"] = { metric: 0, direction: "desc" };
  if (body.orderBy !== null) {
    const order = objectInput(body.orderBy, ["metric", "direction"]);
    if (
      typeof order.metric !== "number" ||
      !Number.isInteger(order.metric) ||
      order.metric < 0 ||
      order.metric >= metrics.length
    )
      return invalid();
    if (order.direction !== "asc" && order.direction !== "desc")
      return invalid();
    orderBy = { metric: order.metric, direction: order.direction };
  }
  const page = positiveInteger(body.page, 50);
  if (!groupBy.length && page !== 1) return invalid();
  return {
    query: scope.query,
    groupBy,
    metrics,
    orderBy,
    page,
    limit: positiveInteger(body.limit, 20),
  };
}
