import { itemLabelField } from "./item-label";
import type { Collection } from "./types";

export interface FilterCondition {
  field: string;
  op: string;
  value?: string | string[];
  quantifier?: "some" | "none";
}
export interface FilterGroup {
  logic: "and" | "or";
  children: FilterNode[];
}
export type FilterNode = FilterGroup | FilterCondition;

export interface FilterField {
  name: string;
  label: string;
  type:
    | "text"
    | "email"
    | "integer"
    | "decimal"
    | "boolean"
    | "datetime"
    | "key";
  keyType?: Collection["primaryKey"]["type"];
  nullable: boolean;
  relationKind?: "m2o" | "o2m" | "m2m";
  options?: { value: string; label: string }[];
}

export interface FilterScope {
  id: string;
  collection: string;
  kind?: "m2o" | "o2m" | "m2m";
  fields: FilterField[];
  presenceField?: string;
  displayField?: string;
  displayTemplate?: string | null;
}

const visible = (collection: Collection, name: string) =>
  collection.primaryKey.name === name ||
  collection.access.read?.includes("*") ||
  collection.access.read?.includes(name);

function fieldsOf(
  collection: Collection,
  prefix = "",
  relationKind?: FilterField["relationKind"],
): FilterField[] {
  const add = (
    name: string,
    label: string,
    type: FilterField["type"],
    nullable: boolean,
    keyType?: FilterField["keyType"],
  ): FilterField => ({
    name: `${prefix}${name}`,
    label,
    type,
    nullable,
    ...(keyType ? { keyType } : {}),
    ...(relationKind ? { relationKind } : {}),
  });
  const fields: FilterField[] = [
    add(
      collection.primaryKey.name,
      `${prefix.replace(".", " → ")}${collection.primaryKey.name}`,
      "key",
      false,
      collection.primaryKey.type,
    ),
  ];
  for (const field of collection.fields) {
    if (!visible(collection, field.name) || field.type === "alias") continue;
    const type =
      field.type === "relation" ||
      field.type === "file" ||
      field.type === "uuid"
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
    const fieldLabel = field.presentation?.label || field.name;
    const label = prefix
      ? `${prefix.slice(0, -1)} → ${fieldLabel}`
      : fieldLabel;
    fields.push({
      ...add(
        field.name,
        label,
        type as FilterField["type"],
        field.nullable,
        field.type === "file" || field.type === "uuid"
          ? "uuid"
          : field.relation?.kind === "m2o"
            ? field.relation.primaryKey.type
            : undefined,
      ),
      ...(field.presentation?.interface === "select"
        ? { options: field.presentation.options }
        : {}),
    });
  }
  for (const timestamp of ["created_at", "updated_at"] as const) {
    if (
      collection.timestamps[
        timestamp === "created_at" ? "createdAt" : "updatedAt"
      ] &&
      visible(collection, timestamp)
    ) {
      fields.push(
        add(
          timestamp,
          prefix ? `${prefix.slice(0, -1)} → ${timestamp}` : timestamp,
          "datetime",
          false,
        ),
      );
    }
  }
  return fields;
}

export function filterFields(
  collection: Collection,
  catalog: Collection[],
): FilterField[] {
  const fields = fieldsOf(collection);
  for (const field of collection.fields) {
    if (!field.relation || !visible(collection, field.name)) continue;
    const target = catalog.find(
      (entry) => entry.name === field.relation?.collection,
    );
    if (!target?.access.read) continue;
    if (
      field.relation.kind === "o2m" &&
      !visible(target, field.relation.throughField)
    )
      continue;
    fields.push(...fieldsOf(target, `${field.name}.`, field.relation.kind));
  }
  return fields;
}

export function filterScopes(
  collection: Collection,
  catalog: Collection[],
): FilterScope[] {
  const fields = filterFields(collection, catalog);
  const scopes: FilterScope[] = [
    {
      id: "$root",
      collection: collection.name,
      fields: fields.filter((field) => !field.name.includes(".")),
    },
  ];
  for (const relationField of collection.fields) {
    const relation = relationField.relation;
    if (!relation) continue;
    const related = fields.filter((field) =>
      field.name.startsWith(`${relationField.name}.`),
    );
    if (related.length === 0) continue;
    const target = catalog.find((entry) => entry.name === relation.collection);
    const presenceField = related.find(
      (field) =>
        field.name === `${relationField.name}.${target?.primaryKey.name}`,
    )?.name;
    scopes.push({
      id: relationField.name,
      collection: relation.collection,
      kind: relation.kind,
      fields: related,
      presenceField,
      displayTemplate: target?.displayTemplate,
      displayField: target ? itemLabelField(target) : undefined,
    });
  }
  return scopes;
}

export const operatorLabels: Record<string, string> = {
  eq: "Равно",
  neq: "Не равно",
  contains: "Содержит (без регистра)",
  notContains: "Не содержит (без регистра)",
  containsCase: "Содержит (точный регистр)",
  notContainsCase: "Не содержит (точный регистр)",
  startsWith: "Начинается с (без регистра)",
  notStartsWith: "Не начинается с (без регистра)",
  startsWithCase: "Начинается с (точный регистр)",
  notStartsWithCase: "Не начинается с (точный регистр)",
  endsWith: "Заканчивается на (без регистра)",
  notEndsWith: "Не заканчивается на (без регистра)",
  endsWithCase: "Заканчивается на (точный регистр)",
  notEndsWithCase: "Не заканчивается на (точный регистр)",
  gt: "Больше",
  gte: "Больше или равно",
  lt: "Меньше",
  lte: "Меньше или равно",
  between: "Между",
  notBetween: "Не между",
  in: "Один из",
  notIn: "Не один из",
  isNull: "NULL",
  notNull: "Не NULL",
  isEmpty: "Пустая строка",
  notEmpty: "Не пустая строка",
  exists: "Связь есть",
  notExists: "Связи нет",
};

export function fieldOperators(field: FilterField): string[] {
  const ops = ["eq", "neq", "in", "notIn"];
  if (field.type === "text" || field.type === "email") {
    ops.push(
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
      "isEmpty",
      "notEmpty",
    );
  }
  if (
    field.type === "integer" ||
    field.type === "decimal" ||
    field.type === "datetime"
  ) {
    ops.push("gt", "gte", "lt", "lte", "between", "notBetween");
  }
  // Imported managed timestamps can retain unknown historical dates.
  if (field.nullable || field.type === "datetime")
    ops.push("isNull", "notNull");
  return ops;
}

export const hasNoValue = (op: string) =>
  ["isNull", "notNull", "isEmpty", "notEmpty", "exists", "notExists"].includes(
    op,
  );
export const hasMultipleValues = (op: string) =>
  ["in", "notIn", "between", "notBetween"].includes(op);

export function readFilter(raw: string): FilterGroup {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed))
      return { logic: "and", children: parsed as FilterCondition[] };
    if (
      parsed &&
      typeof parsed === "object" &&
      "logic" in parsed &&
      "children" in parsed &&
      (parsed.logic === "and" || parsed.logic === "or") &&
      Array.isArray(parsed.children)
    ) {
      return parsed as FilterGroup;
    }
  } catch {
    /* An invalid URL filter is reported by Core. */
  }
  return { logic: "and", children: [] };
}

export function filterCount(node: FilterNode): number {
  return "logic" in node
    ? node.children.reduce((count, child) => count + filterCount(child), 0)
    : 1;
}
