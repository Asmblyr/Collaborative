import type { FilterGroup, FilterNode } from "./filter-input.js";

// The filter API and builder use string operands; SQL parsing uses typed scalars.
export function plainFilter(group: FilterGroup): object {
  function node(value: FilterNode): object {
    if ("logic" in value) return { logic: value.logic, children: value.children.map(node) };
    return { field: value.field, op: value.op,
      ...(value.value === undefined ? {} : { value: Array.isArray(value.value) ? value.value.map(String) : String(value.value) }),
      ...(value.quantifier ? { quantifier: value.quantifier } : {}) };
  }
  return node(group);
}

// Older presets/views stored parsed boolean/integer operands. Normalize on read,
// keeping unknown keys and malformed shapes for the ordinary validator to reject.
export function storedFilterInput(input: unknown, depth = 0): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input) || depth > 3) return input;
  const value = input as Record<string, unknown>;
  if ("logic" in value) return { ...value,
    ...(Array.isArray(value.children) ? { children: value.children.map((child) => storedFilterInput(child, depth + 1)) } : {}) };
  const scalar = (operand: unknown) => typeof operand === "number" || typeof operand === "boolean" ? String(operand) : operand;
  return { ...value, ...(value.value === undefined ? {} : { value: Array.isArray(value.value) ? value.value.map(scalar) : scalar(value.value) }) };
}
