import type { Access } from "../permissions/access.js";
import {
  resolveFilterField,
  type FilterFieldType,
} from "../items/filter-fields.js";
import { ToolArgumentError } from "./errors.js";
import type { CollectionData } from "./collection-data.js";
import type { AggregateInput, AggregateOperation } from "./aggregate-input.js";

/** Scalar physical columns only. No joins that can multiply source rows. */
export function aggregateOperationsFor(
  type: FilterFieldType,
): AggregateOperation[] {
  const operations: AggregateOperation[] = ["count", "count_distinct"];
  if (["integer", "bigint", "decimal"].includes(type)) {
    operations.push("sum", "avg", "min", "max");
  }
  if (type === "datetime" || type === "date") {
    operations.push("min", "max");
  }
  return operations;
}

export function authorizeAggregateFields(
  name: string,
  input: AggregateInput,
  data: CollectionData,
  access: Access,
): FilterFieldType[] {
  const resolve = (field: string) =>
    resolveFilterField(
      field,
      name,
      data.schema,
      data.allowed,
      data.catalog,
      access,
    );
  const groupTypes = input.groupBy.map((field) => resolve(field).type);
  for (const metric of input.metrics) {
    if (metric.field === null) {
      continue;
    }
    const field = resolve(metric.field);
    if (!aggregateOperationsFor(field.type).includes(metric.operation)) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        "Use only operations listed under aggregation.operations for that field in describe_collection.",
        ["metrics"],
        'Invalid argument "metrics": unsupported aggregate operation for field type.',
      );
    }
  }
  return groupTypes;
}
