import type { FilterCondition, FilterScope } from "./item-filter-options";

export function scopeForCondition(
  scopes: FilterScope[],
  condition: FilterCondition,
): FilterScope {
  const relation = scopes.find(
    (scope) => scope.kind && condition.field.startsWith(`${scope.id}.`),
  );
  return relation ?? scopes[0];
}

export function presenceForCondition(
  scope: FilterScope,
  condition: FilterCondition,
): boolean | null {
  if (!scope.presenceField || condition.field !== scope.presenceField)
    return null;
  if (condition.op === "exists") return true;
  if (condition.op === "notExists") return false;
  return null;
}

export function presenceCondition(
  scope: FilterScope,
  exists: boolean,
): FilterCondition {
  if (!scope.presenceField)
    throw new Error("Для этой связи недоступна проверка наличия");
  return { field: scope.presenceField, op: exists ? "exists" : "notExists" };
}
