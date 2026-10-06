import type { FormCondition } from "./index.js";
import type { ItemFilterOperator } from "./item-filter.js";
import type { JsonValue } from "./items.js";

export interface FieldRules {
  hidden?: boolean;
  readonly?: boolean;
  requiredWhen?: FormCondition;
  /** Copied on save from one readable M2O; never accepted from the client. */
  computed?: { relation: string; field: string };
}

export interface RelationChoiceFilter {
  logic: "and" | "or";
  children: Array<
    | RelationChoiceFilter
    | {
        field: string;
        op: ItemFilterOperator;
        quantifier?: "some" | "none";
        value?:
          | { kind: "literal"; value: JsonValue }
          | { kind: "field"; field: string };
      }
  >;
}

export function fieldConditionMatches(
  condition: FormCondition,
  values: Record<string, unknown>,
): boolean;
export function relationFilterDependencies(
  filter: RelationChoiceFilter,
): string[];
/** Missing/empty draft dependencies return null: no candidates can be selected. */
export function resolveRelationChoiceFilter(
  filter: RelationChoiceFilter,
  values: Record<string, unknown>,
): import("./item-filter.js").ItemFilterGroup | null;
