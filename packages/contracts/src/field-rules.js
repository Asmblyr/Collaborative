export function fieldConditionMatches(condition, values) {
  const results = condition.rules.map((rule) => {
    const value = values[rule.field];
    const empty = value == null || (typeof value === "string" && !value.trim());
    if (rule.operator === "empty") {
      return empty;
    }
    if (rule.operator === "notEmpty") {
      return !empty;
    }
    const equal = value != null && String(value) === String(rule.value);
    return rule.operator === "eq" ? equal : !equal;
  });
  return condition.mode === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}

export function relationFilterDependencies(filter) {
  return [
    ...new Set(
      filter.children.flatMap((node) => {
        if ("logic" in node) {
          return relationFilterDependencies(node);
        }
        return node.value?.kind === "field" ? [node.value.field] : [];
      }),
    ),
  ];
}

export function resolveRelationChoiceFilter(filter, values) {
  if (
    relationFilterDependencies(filter).some(
      (field) => values[field] == null || values[field] === "",
    )
  ) {
    return null;
  }
  const walk = (group) => ({
    logic: group.logic,
    children: group.children.map((node) => {
      if ("logic" in node) {
        return walk(node);
      }
      const { value, ...rest } = node;
      if (!value) {
        return rest;
      }
      const operand =
        value.kind === "field" ? values[value.field] : value.value;
      return {
        ...rest,
        value: Array.isArray(operand) ? operand.map(String) : String(operand),
      };
    }),
  });
  return walk(filter);
}
