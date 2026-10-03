import {
  fieldOperators,
  hasMultipleValues,
  hasNoValue,
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type FilterNode,
  type FilterScope,
} from "./item-filter-options";

export type FilterPath = number[];

export function replaceFilterNode(
  group: FilterGroup,
  path: FilterPath,
  replacement: FilterNode,
): FilterGroup {
  if (path.length === 0) return replacement as FilterGroup;
  const [index, ...rest] = path;
  return {
    ...group,
    children: group.children.map((child, position) =>
      position !== index
        ? child
        : rest.length === 0
          ? replacement
          : replaceFilterNode(child as FilterGroup, rest, replacement),
    ),
  };
}

export function addFilterNode(
  group: FilterGroup,
  path: FilterPath,
  addition: FilterNode,
): FilterGroup {
  if (path.length === 0)
    return { ...group, children: [...group.children, addition] };
  const [index, ...rest] = path;
  return {
    ...group,
    children: group.children.map((child, position) =>
      position !== index
        ? child
        : addFilterNode(child as FilterGroup, rest, addition),
    ),
  };
}

export function removeFilterNode(
  group: FilterGroup,
  path: FilterPath,
): FilterGroup {
  const [index, ...rest] = path;
  return {
    ...group,
    children: group.children.flatMap((child, position) => {
      if (position !== index) return [child];
      return rest.length === 0
        ? []
        : [removeFilterNode(child as FilterGroup, rest)];
    }),
  };
}

export function changeFilterOperator(
  condition: FilterCondition,
  op: string,
): FilterCondition {
  if (op === condition.op) return condition;
  if (hasNoValue(op)) return { ...condition, op, value: undefined };
  const values = Array.isArray(condition.value)
    ? condition.value
    : typeof condition.value === "string" && condition.value !== ""
      ? [condition.value]
      : [];
  const value =
    op === "between" || op === "notBetween"
      ? [values[0] ?? "", values[1] ?? ""]
      : hasMultipleValues(op)
        ? values
        : (values[0] ?? "");
  return { ...condition, op, value };
}

function normalizedValue(value: string, field: FilterField): string {
  const invalid = (message: string): never => {
    throw new Error(field.label + ": " + message);
  };
  if (value.length > 255) invalid("максимум 255 символов в значении");
  if (field.type === "datetime") {
    const date = new Date(value);
    if (!value || Number.isNaN(date.valueOf()))
      invalid("выберите корректную дату и время");
    return date.toISOString();
  }
  if (
    field.type === "integer" &&
    (!/^-?\d+$/.test(value) ||
      Number(value) < -2147483648 ||
      Number(value) > 2147483647)
  )
    invalid("введите целое число");
  if (field.type === "boolean" && !["true", "false"].includes(value))
    invalid("выберите Да или Нет");
  if (field.type === "key") {
    if (
      field.keyType === "uuid" &&
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
    ) {
      invalid("введите UUID, например 550e8400-e29b-41d4-a716-446655440000");
    }
    if (field.keyType === "serial" || field.keyType === "bigserial") {
      if (!/^[1-9]\d{0,18}$/.test(value))
        invalid("введите положительный целочисленный ID");
      const limit = BigInt(
        field.keyType === "serial" ? "2147483647" : "9223372036854775807",
      );
      if (BigInt(value) > limit) invalid("ID выходит за допустимый диапазон");
    }
    if (field.keyType === "text" && !value.trim())
      invalid("введите ключ записи");
  }
  return value;
}

function normalizedCondition(
  condition: FilterCondition,
  scopes: FilterScope[],
): FilterCondition {
  const field = scopes
    .flatMap((scope) => scope.fields)
    .find((entry) => entry.name === condition.field);
  const presence = condition.op === "exists" || condition.op === "notExists";
  if (
    !field ||
    (presence
      ? !scopes.some((scope) => scope.presenceField === field.name)
      : !fieldOperators(field).includes(condition.op))
  ) {
    throw new Error(
      "Поле или оператор больше недоступны. Измените или удалите условие.",
    );
  }
  if (presence) return { field: field.name, op: condition.op };
  const quantifier =
    field.relationKind === "o2m" || field.relationKind === "m2m"
      ? { quantifier: condition.quantifier ?? "some" }
      : {};
  if (hasNoValue(condition.op))
    return { field: field.name, op: condition.op, ...quantifier };
  if (hasMultipleValues(condition.op)) {
    const values = condition.value;
    const between = condition.op === "between" || condition.op === "notBetween";
    if (
      !Array.isArray(values) ||
      values.length < (between ? 2 : 1) ||
      values.length > (between ? 2 : 20) ||
      values.some((value) => !value.trim())
    ) {
      throw new Error(
        field.label +
          (between
            ? ": заполните обе границы диапазона"
            : ": введите от 1 до 20 значений"),
      );
    }
    return {
      field: field.name,
      op: condition.op,
      value: values.map((value) => normalizedValue(value, field)),
      ...quantifier,
    };
  }
  const value = condition.value;
  if (
    typeof value !== "string" ||
    (value === "" &&
      !(field.type === "text" && ["eq", "neq"].includes(condition.op))) ||
    (!value.trim() && !["eq", "neq"].includes(condition.op))
  ) {
    throw new Error(field.label + ": введите значение");
  }
  return {
    field: field.name,
    op: condition.op,
    value: normalizedValue(value, field),
    ...quantifier,
  };
}

export function normalizeFilter(
  group: FilterGroup,
  scopes: FilterScope[],
): FilterGroup {
  let nodes = 0;
  let conditions = 0;
  function visit(current: FilterGroup, depth: number): FilterGroup {
    nodes += 1;
    if (depth > 3) throw new Error("Можно вложить до 3 уровней групп.");
    if (depth > 1 && current.children.length === 0) {
      throw new Error("Добавьте условие в пустую группу или удалите её.");
    }
    if (current.children.length > 20)
      throw new Error("В одной группе может быть до 20 условий и групп.");
    return {
      logic: current.logic,
      children: current.children.map((child) => {
        if ("logic" in child) return visit(child, depth + 1);
        nodes += 1;
        conditions += 1;
        if (conditions > 20) throw new Error("Можно добавить до 20 условий.");
        return normalizedCondition(child, scopes);
      }),
    };
  }
  const result = visit(group, 1);
  if (nodes > 30)
    throw new Error("Слишком много групп: упростите структуру фильтра.");
  if (JSON.stringify(result).length > 8192)
    throw new Error(
      "Фильтр слишком большой: сократите количество или длину значений.",
    );
  return result;
}
