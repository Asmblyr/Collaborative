import type { FormLayout, FormNode } from "@/components/items/presentation-types";

export function findFormNode(layout: FormLayout, id: string): FormNode | undefined {
  const walk = (nodes: FormNode[]): FormNode | undefined => { for (const n of nodes) { if (n.id === id) return n; if (n.kind === "group") { const found = walk(n.children); if (found) return found; } } };
  return layout.tabs.map((t) => walk(t.children)).find(Boolean);
}

export function changeFormNode(layout: FormLayout, id: string, update: (node: FormNode) => FormNode): FormLayout {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.map((n) => n.id === id ? update(n) : n.kind === "group" ? { ...n, children: walk(n.children) } : n);
  return { ...layout, tabs: layout.tabs.map((t) => ({ ...t, children: walk(t.children) })) };
}

export function removeFormNode(layout: FormLayout, id: string, keepChildren = false): FormLayout {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.flatMap((n) => n.id === id ? keepChildren && n.kind === "group" ? n.children : []
    : n.kind === "group" ? [{ ...n, children: walk(n.children) }] : [n]);
  return { ...layout, tabs: layout.tabs.map((t) => ({ ...t, children: walk(t.children) })) };
}

export function appendFormNode(layout: FormLayout, parent: string, node: FormNode): FormLayout {
  const walk = (nodes: FormNode[]): FormNode[] => nodes.map((n) => n.kind !== "group" ? n : { ...n, children: n.id === parent ? [...n.children, node] : walk(n.children) });
  return { ...layout, tabs: layout.tabs.map((t) => ({ ...t, children: t.id === parent ? [...t.children, node] : walk(t.children) })) };
}

export function formParents(layout: FormLayout, exclude?: string) {
  const result: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: FormNode[], label: string, depth: number) => nodes.forEach((n) => {
    if (n.kind !== "group" || n.id === exclude) return;
    const path = `${label} / ${n.label}`;
    result.push({ id: n.id, label: path, depth }); walk(n.children, path, depth + 1);
  });
  for (const t of layout.tabs) { result.push({ id: t.id, label: t.label, depth: 0 }); walk(t.children, t.label, 1); }
  return result;
}

export function formParentOf(layout: FormLayout, id: string): string | undefined {
  const walk = (nodes: FormNode[], parent: string): string | undefined => {
    for (const n of nodes) { if (n.id === id) return parent; if (n.kind === "group") { const found = walk(n.children, n.id); if (found) return found; } }
  };
  return layout.tabs.map((t) => walk(t.children, t.id)).find(Boolean);
}

export function formNodeDepth(node: FormNode): number {
  return node.kind === "field" ? 0 : 1 + Math.max(0, ...node.children.map(formNodeDepth));
}

export function reorderFormNode(layout: FormLayout, id: string, offset: number): FormLayout {
  const swap = <T extends { id: string }>(nodes: T[]): T[] => {
    const index = nodes.findIndex((n) => n.id === id);
    if (index < 0 || index + offset < 0 || index + offset >= nodes.length) return nodes;
    const copy = [...nodes]; [copy[index], copy[index + offset]] = [copy[index + offset], copy[index]]; return copy;
  };
  const walk = (nodes: FormNode[]): FormNode[] => swap(nodes).map((n) => n.kind === "group" ? { ...n, children: walk(n.children) } : n);
  return { ...layout, tabs: swap(layout.tabs).map((t) => ({ ...t, children: walk(t.children) })) };
}
