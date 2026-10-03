import { parseFieldValue } from "../collections/field-values.js";
import type { Collection } from "../collections/types.js";
import type { Access } from "../permissions/access.js";
import {
  resolveFilterField,
  type ResolvedFilterField,
} from "./filter-fields.js";
import type { collectionSchema } from "./schema-repository.js";
import { ItemError, parseItemId } from "./validation.js";
import type { ItemFilterOperator } from "@asmblyr/contracts";

export type FilterOperator = ItemFilterOperator;

export interface ItemFilter {
  field: string;
  op: FilterOperator;
  value?: string | number | boolean | Array<string | number | boolean>;
  quantifier?: "some" | "none";
  resolved: ResolvedFilterField;
}

export interface FilterGroup {
  logic: "and" | "or";
  children: FilterNode[];
}
export type FilterNode = FilterGroup | ItemFilter;

type Schema = Awaited<ReturnType<typeof collectionSchema>>;
const valueFree = new Set<FilterOperator>([
  "isNull",
  "notNull",
  "isEmpty",
  "notEmpty",
  "exists",
  "notExists",
]);
const multiple = new Set<FilterOperator>([
  "in",
  "notIn",
  "between",
  "notBetween",
]);
const textOperators = new Set<FilterOperator>([
  "contains",
  "notContains",
  "containsCase",
  "notContainsCase",
  "startsWith",
  "notStartsWith",
  "startsWithCase",
  "notStartsWithCase",
  "endsWith",
  "notEndsWith",
  "endsWithCase",
  "notEndsWithCase",
  "isEmpty",
  "notEmpty",
]);
const rangeOperators = new Set<FilterOperator>([
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "notBetween",
]);
const allOperators = new Set<FilterOperator>([
  "eq",
  "neq",
  ...textOperators,
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "notBetween",
  "in",
  "notIn",
  "isNull",
  "notNull",
  "isEmpty",
  "notEmpty",
  "exists",
  "notExists",
]);

function parsedScalar(
  value: unknown,
  field: string,
  resolved: ResolvedFilterField,
  operator: FilterOperator,
): string | number | boolean {
  if (typeof value !== "string" || value.length > 255) {
    throw new ItemError(`Invalid filter value: ${field}`, 400);
  }
  try {
    // Pattern operands are fragments, not values being written to an email field.
    if (resolved.type === "email" && textOperators.has(operator)) return value;
    if (resolved.type === "key") return parseItemId(value, resolved.keyType!);
    if (resolved.type === "integer") {
      if (!/^-?\d+$/.test(value)) throw new Error("Invalid integer");
      return parseFieldValue(
        { name: field, type: "integer", required: false },
        Number(value),
      ) as number;
    }
    if (resolved.type === "boolean") {
      if (value !== "true" && value !== "false")
        throw new Error("Invalid boolean");
      return value === "true";
    }
    const parsed = parseFieldValue(
      { name: field, type: resolved.type, required: false },
      value,
    );
    if (
      typeof parsed === "string" ||
      typeof parsed === "number" ||
      typeof parsed === "boolean"
    )
      return parsed;
    throw new Error("Expected scalar filter operand");
  } catch {
    throw new ItemError(`Invalid filter value: ${field}`, 400);
  }
}

function parseCondition(
  input: Record<string, unknown>,
  sourceName: string,
  schema: Schema,
  allowed: string[],
  catalog: Collection[],
  access?: Access,
): ItemFilter {
  const { field, op, value, quantifier } = input;
  if (
    typeof field !== "string" ||
    typeof op !== "string" ||
    !allOperators.has(op as FilterOperator) ||
    Object.keys(input).some(
      (key) => !["field", "op", "value", "quantifier"].includes(key),
    )
  ) {
    throw new ItemError("Invalid filter condition", 400);
  }
  const operator = op as FilterOperator;
  const resolved = resolveFilterField(
    field,
    sourceName,
    schema,
    allowed,
    catalog,
    access,
  );
  if (
    (operator === "exists" || operator === "notExists") &&
    (!resolved.relation || resolved.column !== resolved.relation.targetKey)
  ) {
    throw new ItemError("Relation existence requires a related field", 400);
  }
  if (
    textOperators.has(operator) &&
    resolved.type !== "text" &&
    resolved.type !== "email"
  ) {
    throw new ItemError("Invalid filter operator", 400);
  }
  if (
    rangeOperators.has(operator) &&
    !["integer", "decimal", "datetime"].includes(resolved.type)
  ) {
    throw new ItemError("Invalid filter operator", 400);
  }
  if (
    (operator === "isNull" || operator === "notNull") &&
    resolved.type === "key" &&
    !resolved.nullable
  ) {
    throw new ItemError("Primary key cannot be null", 400);
  }
  if (
    quantifier !== undefined &&
    ((quantifier !== "some" && quantifier !== "none") ||
      !resolved.relation ||
      resolved.relation.kind === "m2o" ||
      operator === "exists" ||
      operator === "notExists")
  ) {
    throw new ItemError("Invalid relation quantifier", 400);
  }
  if (valueFree.has(operator)) {
    if ("value" in input) throw new ItemError("Unexpected filter value", 400);
    return {
      field,
      op: operator,
      resolved,
      ...(quantifier ? { quantifier: quantifier as "some" | "none" } : {}),
    };
  }
  if (multiple.has(operator)) {
    if (
      !Array.isArray(value) ||
      value.length <
        (operator.includes("Between") || operator === "between" ? 2 : 1) ||
      value.length >
        (operator.includes("Between") || operator === "between" ? 2 : 20)
    ) {
      throw new ItemError(`Invalid filter value: ${field}`, 400);
    }
    return {
      field,
      op: operator,
      value: value.map((part) => parsedScalar(part, field, resolved, operator)),
      resolved,
      ...(quantifier ? { quantifier: quantifier as "some" | "none" } : {}),
    };
  }
  if (
    textOperators.has(operator) &&
    (typeof value !== "string" || !value.trim())
  ) {
    throw new ItemError(`Invalid filter value: ${field}`, 400);
  }
  return {
    field,
    op: operator,
    value: parsedScalar(value, field, resolved, operator),
    resolved,
    ...(quantifier ? { quantifier: quantifier as "some" | "none" } : {}),
  };
}

export function parseItemFilters(
  raw: unknown,
  sourceName: string,
  schema: Schema,
  allowed: string[],
  catalog: Collection[] = [],
  access?: Access,
): FilterGroup {
  if (raw === undefined) return { logic: "and", children: [] };
  if (typeof raw !== "string" || raw.length > 8192)
    throw new ItemError("Invalid filter", 400);
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new ItemError("Invalid filter JSON", 400);
  }
  if (Array.isArray(input)) {
    if (input.length > 10) throw new ItemError("Invalid filter list", 400);
    input = { logic: "and", children: input };
  }
  let nodes = 0;
  let conditions = 0;
  function parseNode(node: unknown, depth: number): FilterNode {
    nodes += 1;
    if (nodes > 30) throw new ItemError("Too many filter nodes", 400);
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new ItemError("Invalid filter node", 400);
    }
    const object = node as Record<string, unknown>;
    if ("logic" in object) {
      if (
        depth > 3 ||
        (object.logic !== "and" && object.logic !== "or") ||
        !Array.isArray(object.children) ||
        object.children.length > 20 ||
        Object.keys(object).some(
          (key) => key !== "logic" && key !== "children",
        ) ||
        (depth > 1 && object.children.length === 0)
      ) {
        throw new ItemError("Invalid filter group", 400);
      }
      return {
        logic: object.logic,
        children: object.children.map((child) => parseNode(child, depth + 1)),
      };
    }
    conditions += 1;
    if (conditions > 20) throw new ItemError("Too many filter conditions", 400);
    return parseCondition(object, sourceName, schema, allowed, catalog, access);
  }
  const result = parseNode(input, 1);
  if (!("logic" in result)) throw new ItemError("Filter must be a group", 400);
  return result;
}
