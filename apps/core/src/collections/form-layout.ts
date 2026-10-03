import type { FormCondition, FormNode, FormLayout } from "@asmblyr/contracts";
export type { FormCondition, FormNode, FormLayout } from "@asmblyr/contracts";
import { CollectionInputError } from "./validation.js";

type Field = { name: string; type: string };

export function parseFormLayout(value: unknown, fields: Field[]): FormLayout | null {
  if (value === null) return null;
  const fail = (message: string): never => {
    throw new CollectionInputError(`Invalid form layout: ${message}`);
  };
  const object = (v: unknown, keys: string[]): Record<string, unknown> => {
    if (
      !v ||
      typeof v !== "object" ||
      Array.isArray(v) ||
      Object.keys(v).some((k) => !keys.includes(k))
    )
      return fail("unexpected properties");
    return v as Record<string, unknown>;
  };
  const text = (v: unknown, max: number, required = false): string => {
    if (typeof v !== "string" || v.length > max || v.includes("\0") || (required && !v.trim()))
      return fail("invalid label");
    return v.trim();
  };
  const ids = new Set<string>(),
    used = new Set<string>();
  const available = new Map(fields.filter((f) => f.type !== "alias").map((f) => [f.name, f.type]));
  const identity = (v: unknown) => {
    if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v) || ids.has(v))
      return fail("duplicate or invalid node ID");
    ids.add(v);
    if (ids.size > 300) return fail("at most 300 nodes");
    return v;
  };
  const condition = (v: unknown): FormCondition | undefined => {
    if (v === undefined) return undefined;
    const c = object(v, ["mode", "rules"]);
    if (
      !["all", "any"].includes(c.mode as string) ||
      !Array.isArray(c.rules) ||
      !c.rules.length ||
      c.rules.length > 12
    )
      return fail("invalid condition");
    return {
      mode: c.mode as FormCondition["mode"],
      rules: c.rules.map((entry) => {
        const r = object(entry, ["field", "operator", "value"]);
        if (
          typeof r.field !== "string" ||
          !["text", "email", "integer", "decimal", "boolean", "datetime", "relation"].includes(
            available.get(r.field) ?? "",
          ) ||
          !["eq", "ne", "empty", "notEmpty"].includes(r.operator as string)
        )
          return fail("unknown condition field or operator");
        if (r.operator === "empty" || r.operator === "notEmpty") {
          if (r.value !== undefined) return fail("empty checks have no value");
          return { field: r.field, operator: r.operator };
        }
        if (
          !["string", "number", "boolean"].includes(typeof r.value) ||
          (typeof r.value === "string" && (r.value.length > 500 || r.value.includes("\0"))) ||
          (typeof r.value === "number" && !Number.isFinite(r.value))
        )
          return fail("invalid comparison value");
        return {
          field: r.field,
          operator: r.operator as "eq" | "ne",
          value: r.value as string | number | boolean,
        };
      }),
    };
  };
  const nodes = (v: unknown, depth: number): FormNode[] => {
    if (!Array.isArray(v) || depth > 3) return fail("sections support at most three nested levels");
    return v.map((entry): FormNode => {
      const n = object(entry, [
        "id",
        "kind",
        "field",
        "width",
        "label",
        "description",
        "collapsible",
        "collapsed",
        "children",
        "when",
      ]);
      const id = identity(n.id),
        when = condition(n.when);
      if (n.kind === "field") {
        object(entry, ["id", "kind", "field", "width", "when"]);
        if (
          typeof n.field !== "string" ||
          !available.has(n.field) ||
          used.has(n.field) ||
          !["full", "half"].includes(n.width as string)
        )
          return fail("unknown or duplicated field");
        used.add(n.field);
        if (when?.rules.some((r) => r.field === n.field)) return fail("a field cannot hide itself");
        return {
          id,
          kind: "field",
          field: n.field,
          width: n.width as "full" | "half",
          ...(when ? { when } : {}),
        };
      }
      if (
        n.kind !== "group" ||
        typeof n.collapsible !== "boolean" ||
        typeof n.collapsed !== "boolean"
      )
        return fail("invalid section");
      object(entry, [
        "id",
        "kind",
        "label",
        "description",
        "collapsible",
        "collapsed",
        "children",
        "when",
      ]);
      const children = nodes(n.children, depth + 1);
      const descendants = formFields(children);
      if (when?.rules.some((r) => descendants.has(r.field)))
        return fail("a section cannot hide its own condition controls");
      return {
        id,
        kind: "group",
        label: text(n.label, 120, true),
        description: text(n.description, 1000),
        collapsible: n.collapsible,
        collapsed: n.collapsed,
        children,
        ...(when ? { when } : {}),
      };
    });
  };
  const layout = object(value, ["version", "tabs"]);
  if (
    layout.version !== 1 ||
    !Array.isArray(layout.tabs) ||
    !layout.tabs.length ||
    layout.tabs.length > 12
  )
    return fail("use 1–12 tabs, version 1");
  return {
    version: 1,
    tabs: layout.tabs.map((entry) => {
      const tab = object(entry, ["id", "label", "children"]);
      return {
        id: identity(tab.id),
        label: text(tab.label, 120, true),
        children: nodes(tab.children, 0),
      };
    }),
  };
}

export function formFields(nodes: FormNode[]): Set<string> {
  return new Set(
    nodes.flatMap((n) => (n.kind === "field" ? [n.field] : [...formFields(n.children)])),
  );
}

// Also strips condition literals for fields the catalog consumer cannot access.
export function reconcileForm(
  layout: FormLayout | null | undefined,
  fields: string[],
): FormLayout | null {
  if (!layout) return null;
  const available = new Set(fields);
  const walk = (nodes: FormNode[]): FormNode[] =>
    nodes.flatMap((node) => {
      if (node.kind === "field" && !available.has(node.field)) return [];
      const { when, ...rest } = node;
      const safe = when?.rules.every((r) => available.has(r.field)) ? { ...rest, when } : rest;
      return [safe.kind === "group" ? { ...safe, children: walk(safe.children) } : safe];
    });
  return { version: 1, tabs: layout.tabs.map((tab) => ({ ...tab, children: walk(tab.children) })) };
}
