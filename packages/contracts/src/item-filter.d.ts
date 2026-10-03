/** The same operators and string operands as the /items filter API. */
export type ItemFilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "containsCase"
  | "notContainsCase"
  | "startsWith"
  | "notStartsWith"
  | "startsWithCase"
  | "notStartsWithCase"
  | "endsWith"
  | "notEndsWith"
  | "endsWithCase"
  | "notEndsWithCase"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "notBetween"
  | "in"
  | "notIn"
  | "isNull"
  | "notNull"
  | "isEmpty"
  | "notEmpty"
  | "exists"
  | "notExists";

export interface ItemFilterCondition {
  readonly field: string;
  readonly op: ItemFilterOperator;
  readonly value?: string | readonly string[];
  readonly quantifier?: "some" | "none";
}

export interface ItemFilterGroup {
  readonly logic: "and" | "or";
  readonly children: readonly (ItemFilterCondition | ItemFilterGroup)[];
}
