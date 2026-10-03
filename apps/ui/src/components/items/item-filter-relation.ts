import { changeFilterOperator } from "./item-filter-model";
import type { FilterCondition, FilterScope } from "./item-filter-options";

export const isManyRelation = (scope: FilterScope) => scope.kind === "o2m" || scope.kind === "m2m";

export function relationSelectionScope(scopes: FilterScope[], condition: FilterCondition): FilterScope | undefined {
  return scopes.find((scope) => scope.kind === "m2o" ? condition.field === scope.id :
    isManyRelation(scope) && condition.field === scope.presenceField &&
      ["eq", "in", "exists", "notExists"].includes(condition.op));
}

export function relationSelectionCondition(scope: FilterScope): FilterCondition {
  if (scope.kind === "m2o") return { field: scope.id, op: "eq", value: "" };
  if (!scope.presenceField) throw new Error("Для этой связи недоступен выбор записей");
  return { field: scope.presenceField, op: "in", value: [], quantifier: "some" };
}

export function relationSelectionOperator(condition: FilterCondition, scope: FilterScope): string {
  if (isManyRelation(scope) && condition.quantifier === "none") {
    if (condition.op === "eq") return "neq";
    if (condition.op === "in") return "notIn";
  }
  return condition.op;
}

export function changeRelationSelectionOperator(condition: FilterCondition, scope: FilterScope, op: string): FilterCondition {
  if (!isManyRelation(scope)) return changeFilterOperator(condition, op);
  const negative = op === "neq" || op === "notIn";
  const next = changeFilterOperator(condition, op === "neq" ? "eq" : op === "notIn" ? "in" : op);
  if (op === "exists" || op === "notExists") return { field: next.field, op };
  return { ...next, quantifier: negative ? "none" : "some" };
}
