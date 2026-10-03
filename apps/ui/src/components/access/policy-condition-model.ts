import {
  permissionContextParameters,
  type PermissionCondition,
  type PermissionFilter,
} from "@asmblyr/contracts";
import {
  fieldOperators,
  hasNoValue,
  hasMultipleValues,
  operatorLabels,
  type FilterField,
} from "../items/item-filter-options";
import type { PolicyCollection } from "./types";

export function permissionFields(collection: PolicyCollection): FilterField[] {
  const key = collection.primaryKey;
  const fields: FilterField[] = [
    {
      name: key.name,
      label: "ID",
      type: "key",
      keyType: key.type,
      nullable: false,
    },
  ];
  for (const field of collection.fields) {
    const type =
      field.type === "uuid" ||
      field.type === "relation" ||
      field.type === "file"
        ? "key"
        : field.type;
    if (
      ![
        "text",
        "email",
        "integer",
        "decimal",
        "boolean",
        "datetime",
        "key",
      ].includes(type)
    )
      continue;
    fields.push({
      name: field.name,
      label: field.presentation?.label || field.name,
      type: type as FilterField["type"],
      nullable: field.nullable ?? true,
      keyType:
        field.relation?.kind === "m2o"
          ? field.relation.primaryKey.type
          : type === "key"
            ? "uuid"
            : undefined,
      options:
        field.name === collection.state?.field
          ? collection.state.statuses.map(({ value, label }) => ({
              value,
              label,
            }))
          : field.presentation?.options,
    });
  }
  if (collection.timestamps.createdAt)
    fields.push({
      name: "created_at",
      label: "Дата создания",
      type: "datetime",
      nullable: false,
    });
  if (collection.timestamps.updatedAt)
    fields.push({
      name: "updated_at",
      label: "Дата изменения",
      type: "datetime",
      nullable: false,
    });
  return fields;
}

export function compatibleParameters(field: FilterField, op: string) {
  if (hasMultipleValues(op) || hasNoValue(op)) return [];
  return permissionContextParameters.filter((parameter) =>
    parameter.type === "datetime"
      ? field.type === "datetime"
      : parameter.type === "email"
        ? ["text", "email"].includes(field.type)
        : field.type === "text" ||
          (field.type === "key" && field.keyType === "uuid"),
  );
}

export function newPermissionCondition(
  fields: FilterField[],
): PermissionCondition {
  const field = fields.find((entry) => entry.name !== "id") ?? fields[0];
  return {
    field: field.name,
    op: "eq",
    value: {
      kind: "literal",
      value:
        field.options?.[0]?.value ?? (field.type === "boolean" ? "true" : ""),
    },
  };
}

export function conditionIsValid(
  group: PermissionFilter,
  fields: FilterField[],
  depth = 1,
): boolean {
  if (!group.children.length || depth > 3) return false;
  if (depth === 1) {
    let nodes = 0,
      conditions = 0;
    function count(value: PermissionFilter) {
      nodes++;
      value.children.forEach((child) => {
        if ("logic" in child) count(child);
        else {
          nodes++;
          conditions++;
        }
      });
    }
    count(group);
    if (nodes > 30 || conditions > 20 || JSON.stringify(group).length > 8192)
      return false;
  }
  return group.children.every((child) => {
    if ("logic" in child) return conditionIsValid(child, fields, depth + 1);
    const field = fields.find((entry) => entry.name === child.field);
    if (!field || !fieldOperators(field).includes(child.op)) return false;
    if (hasNoValue(child.op)) return child.value === undefined;
    const operand = child.value;
    if (operand?.kind === "context")
      return compatibleParameters(field, child.op).some(
        (entry) => entry.path === operand.path,
      );
    if (child.value?.kind !== "literal") return false;
    const values = Array.isArray(child.value.value)
      ? child.value.value
      : [child.value.value];
    const range = child.op === "between" || child.op === "notBetween";
    return (
      values.length >= (range ? 2 : 1) &&
      values.length <= (range ? 2 : 20) &&
      values.every((value) => {
        if (field.type === "boolean")
          return value === "true" || value === "false";
        if (["integer", "decimal"].includes(field.type))
          return (
            /^-?\d+(?:\.\d+)?$/.test(value) &&
            (field.type !== "integer" || /^-?\d+$/.test(value))
          );
        if (field.type === "datetime")
          return value !== "" && !Number.isNaN(Date.parse(value));
        if (field.type === "key" && field.keyType === "uuid")
          return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
        return (
          ![
            "contains",
            "startsWith",
            "endsWith",
            "notContains",
            "notStartsWith",
            "notEndsWith",
          ].includes(child.op) || Boolean(value.trim())
        );
      })
    );
  });
}

export function conditionSummary(
  group: PermissionFilter,
  fields: FilterField[],
): string {
  return group.children
    .map((child) => {
      if ("logic" in child) return `(${conditionSummary(child, fields)})`;
      const field = fields.find((entry) => entry.name === child.field);
      const operand = child.value;
      const value =
        operand?.kind === "context"
          ? permissionContextParameters.find(
              (entry) => entry.path === operand.path,
            )?.label
          : operand?.kind === "literal"
            ? Array.isArray(operand.value)
              ? operand.value.join(", ")
              : (field?.options?.find((entry) => entry.value === operand.value)
                  ?.label ?? operand.value)
            : "";
      return `${field?.label ?? child.field} ${child.op === "eq" ? "=" : child.op === "neq" ? "≠" : operatorLabels[child.op]} ${value ?? ""}`.trim();
    })
    .join(group.logic === "and" ? " · И · " : " · ИЛИ · ");
}
