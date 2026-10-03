import {
  hasNoValue,
  operatorLabels,
  type FilterNode,
} from "./item-filter-options";

export function describeFilter(
  node: FilterNode,
  labels: Map<string, string> = new Map(),
  choices: Map<string, { value: string; label: string }[]> = new Map(),
): string {
  if ("logic" in node)
    return `(${node.children.map((child) => describeFilter(child, labels, choices)).join(node.logic === "and" ? " И " : " ИЛИ ")})`;
  const field = labels.get(node.field) ?? node.field.replaceAll(".", " → ");
  const quantifier =
    node.quantifier === "none"
      ? "Ни одна связь: "
      : node.quantifier === "some"
        ? "Хотя бы одна связь: "
        : "";
  const labelFor = (value: string) =>
    choices.get(node.field)?.find((option) => option.value === value)?.label ??
    value;
  const value = Array.isArray(node.value)
    ? node.value.map(labelFor).join(", ")
    : labelFor(node.value ?? "");
  return `${quantifier}${field} · ${(operatorLabels[node.op] ?? node.op).toLocaleLowerCase()}${hasNoValue(node.op) ? "" : ` · ${value}`}`;
}
