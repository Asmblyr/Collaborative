import type { CollectionField } from "./types";
import type { FormCondition, FormLayout, FormNode } from "./presentation-types";

export function fieldsInNodes(nodes: FormNode[]): string[] {
  return nodes.flatMap((n) => n.kind === "field" ? [n.field] : fieldsInNodes(n.children));
}

export function layoutHasConditions(layout: FormLayout): boolean {
  const hasCondition = (nodes: FormNode[]): boolean => nodes.some((node) =>
    Boolean(node.when) || node.kind === "group" && hasCondition(node.children));
  return layout.tabs.some((tab) => hasCondition(tab.children));
}

export function automaticLayout(fields: CollectionField[]): FormLayout {
  const nodes: FormNode[] = [], groups = new Map<string, Extract<FormNode, { kind: "group" }>>();
  for (const field of [...fields].filter((f) => f.type !== "alias").sort((a, b) => (a.presentation?.order ?? 0) - (b.presentation?.order ?? 0))) {
    const node: FormNode = { id: `field_${field.name}`, kind: "field", field: field.name, width: field.presentation?.width ?? "full" };
    const name = field.presentation?.group;
    if (!name) { nodes.push(node); continue; }
    let group = groups.get(name);
    if (!group) { group = { id: `group_${groups.size}`, kind: "group", label: name, description: "", collapsible: false, collapsed: false, children: [] }; groups.set(name, group); nodes.push(group); }
    group.children.push(node);
  }
  return { version: 1, tabs: [{ id: "main", label: "Основное", children: nodes }] };
}

export function effectiveLayout(layout: FormLayout | null | undefined, fields: CollectionField[]): FormLayout {
  if (!layout) return automaticLayout(fields);
  const available = new Set(fields.map((f) => f.name));
  const used = new Set(layout.tabs.flatMap((t) => fieldsInNodes(t.children)));
  const walk = (nodes: FormNode[]): FormNode[] => nodes.flatMap((n): FormNode[] => {
    if (n.kind === "field") return available.has(n.field) ? [n] : [];
    const children = walk(n.children);
    return children.length ? [{ ...n, children }] : [];
  });
  const tabs = layout.tabs.map((t) => ({ ...t, children: walk(t.children) })).filter((t) => t.children.length);
  const other = automaticLayout(fields.filter((f) => !used.has(f.name))).tabs[0].children;
  if (other.length) {
    if (tabs.length <= 1) {
      if (!tabs.length) tabs.push({ id: "$main", label: "Основное", children: [] });
      tabs[0] = { ...tabs[0], children: [...tabs[0].children, { id: "$other", kind: "group", label: "Другие поля", description: "", collapsible: false, collapsed: false, children: other }] };
    } else tabs.push({ id: "$other", label: "Другие поля", children: other });
  }
  return { version: 1, tabs };
}

export function conditionMatches(when: FormCondition | undefined, values: Record<string, string>): boolean {
  // A missing permission/deleted dependency disables the entire UI condition.
  if (!when || when.rules.some((r) => !Object.hasOwn(values, r.field))) return true;
  const results = when.rules.map((r) => {
    const value = values[r.field];
    if (r.operator === "empty") return value.trim() === "";
    if (r.operator === "notEmpty") return value.trim() !== "";
    return r.operator === "eq" ? value === String(r.value) : value !== String(r.value);
  });
  return when.mode === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function visibleLayout(layout: FormLayout, values: Record<string, string>, forced: Set<string>): FormLayout {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.flatMap((n): FormNode[] => {
    if (!conditionMatches(n.when, values) && !fieldsInNodes([n]).some((f) => forced.has(f))) return [];
    if (n.kind === "field") return [n];
    const children = walk(n.children);
    return children.length ? [{ ...n, children }] : [];
  });
  return { version: 1, tabs: layout.tabs.map((t) => ({ ...t, children: walk(t.children) })).filter((t) => t.children.length) };
}
