import { aggregateOperations } from "./aggregate-input.js";

export const aggregateProperties = {
  groupBy: {
    type: "array",
    items: { type: "string", maxLength: 63 },
    maxItems: 3,
    description:
      "Readable scalar physical fields from describe_collection.filterPaths with aggregation metadata. [] gives a single total. M2O foreign keys are allowed; related paths, to-many fields, JSON and files arrays are not.",
  },
  metrics: {
    type: "array",
    minItems: 1,
    maxItems: 5,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["operation", "field"],
      properties: {
        operation: { type: "string", enum: aggregateOperations },
        field: { type: ["string", "null"], maxLength: 63 },
      },
    },
    description:
      "count with field=null counts records. Other metrics require a readable scalar field. sum/avg: integer or decimal only; min/max: integer, decimal or datetime. count(field) and count_distinct(field) exclude NULL. Numeric results are exact decimal strings, never convert them to approximate numbers.",
  },
  orderBy: {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["metric", "direction"],
    properties: {
      metric: { type: "integer", minimum: 0, maximum: 4 },
      direction: { type: "string", enum: ["asc", "desc"] },
    },
    description:
      "Sort groups by zero-based metric index; null means metric 0 descending. Ties use group fields ascending. Numeric/date sorting happens before text encoding.",
  },
  page: { type: "integer", minimum: 1, maximum: 50 },
  limit: { type: "integer", minimum: 1, maximum: 20 },
};
