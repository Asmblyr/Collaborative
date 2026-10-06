import type { ItemFilterOperator } from "@asmblyr-collaborative/contracts";
import type { FieldDefinition } from "./definition.js";
import { Predicate } from "./predicate.js";
declare const valueType: unique symbol;
export interface FieldRef<Value, Name extends string> {
  readonly [valueType]: Value;
  readonly name: Name;
  asc(): SortRef<Name>;
  desc(): SortRef<Name>;
}
export interface SortRef<Name extends string> {
  readonly name: Name;
  readonly direction: "asc" | "desc";
}
interface Scalar<Value> {
  eq(value: Value): Predicate;
  neq(value: Value): Predicate;
  in(values: readonly Value[]): Predicate;
  notIn(values: readonly Value[]): Predicate;
}
interface Ordered<Value> {
  gt(value: Value): Predicate;
  gte(value: Value): Predicate;
  lt(value: Value): Predicate;
  lte(value: Value): Predicate;
  between(low: Value, high: Value): Predicate;
  notBetween(low: Value, high: Value): Predicate;
}
interface Text {
  contains(value: string): Predicate;
  notContains(value: string): Predicate;
  containsCase(value: string): Predicate;
  notContainsCase(value: string): Predicate;
  startsWith(value: string): Predicate;
  notStartsWith(value: string): Predicate;
  startsWithCase(value: string): Predicate;
  notStartsWithCase(value: string): Predicate;
  endsWith(value: string): Predicate;
  notEndsWith(value: string): Predicate;
  endsWithCase(value: string): Predicate;
  notEndsWithCase(value: string): Predicate;
  isEmpty(): Predicate;
  notEmpty(): Predicate;
}
export type QueryField<
  Value,
  Name extends string,
  Definition extends FieldDefinition,
> = FieldRef<Value, Name> &
  (Definition["kind"] extends "none" ? unknown : Scalar<NonNullable<Value>>) &
  (Definition["kind"] extends "ordered"
    ? Ordered<NonNullable<Value>>
    : unknown) &
  (Definition["kind"] extends "text" ? Text : unknown) &
  (Definition["kind"] extends "none"
    ? unknown
    : Definition["nullable"] extends true
      ? {
          isNull(): Predicate;
          notNull(): Predicate;
        }
      : unknown);
const fields = new WeakMap<object, string>();
const sorts = new WeakMap<object, SortRef<string>>();
export function fieldName(value: object): string {
  const name = fields.get(value);
  if (!name) {
    throw new TypeError("select must return fields from this query");
  }
  return name;
}
export function sortValue(value: object): SortRef<string> {
  const sort = sorts.get(value);
  if (!sort) {
    throw new TypeError("orderBy must return a field's asc() or desc()");
  }
  return sort;
}
function operand(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isSafeInteger(value))
  ) {
    return String(value);
  }
  throw new TypeError(
    "Filter operands must be API strings, booleans or safe integers",
  );
}
export function createField(name: string, definition: FieldDefinition): object {
  const field: Record<string, unknown> = { name };
  for (const direction of ["asc", "desc"] as const) {
    field[direction] = () => {
      const sort = Object.freeze({ name, direction });
      sorts.set(sort, sort);
      return sort;
    };
  }
  function add(
    op: ItemFilterOperator,
    arity: "none" | "one" | "list" | "range",
  ) {
    field[op] = (...values: unknown[]) => {
      let value: string | string[] | undefined;
      if (arity === "one") {
        value = operand(values[0]);
      } else if (arity === "range") {
        value = values.map(operand);
      } else if (arity === "list") {
        if (!Array.isArray(values[0])) {
          throw new TypeError("Filter lists require an array");
        }
        value = values[0].map(operand);
      }
      if (Array.isArray(value) && (value.length < 1 || value.length > 20)) {
        throw new TypeError("Filter lists require 1–20 values");
      }
      return new Predicate({
        field: name,
        op,
        ...(value === undefined ? {} : { value }),
      });
    };
  }
  if (definition.kind !== "none") {
    add("eq", "one");
    add("neq", "one");
    add("in", "list");
    add("notIn", "list");
    if (definition.nullable) {
      add("isNull", "none");
      add("notNull", "none");
    }
  }
  if (definition.kind === "ordered") {
    for (const op of ["gt", "gte", "lt", "lte"] as const) {
      add(op, "one");
    }
    add("between", "range");
    add("notBetween", "range");
  }
  if (definition.kind === "text") {
    for (const op of [
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
    ] as const) {
      add(op, "one");
    }
    add("isEmpty", "none");
    add("notEmpty", "none");
  }
  fields.set(field, name);
  return Object.freeze(field);
}
