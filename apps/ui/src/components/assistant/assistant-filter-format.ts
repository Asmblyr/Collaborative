import {
  filterFields,
  type FilterGroup,
  type FilterNode,
} from "@/components/items/item-filter-options";
import type { Collection } from "@/components/items/types";

const decimalPattern = /^-?\d+\.\d+$/;

export function formatFilterDecimal(value: string): string {
  if (!decimalPattern.test(value)) {
    return value;
  }

  const trimmed = value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}

export function normalizeFilterNode(node: FilterNode): FilterNode {
  if ("logic" in node) {
    return {
      ...node,
      children: node.children.map(normalizeFilterNode),
    };
  }

  if (Array.isArray(node.value)) {
    return {
      ...node,
      value: node.value.map(formatFilterDecimal),
    };
  }

  if (typeof node.value === "string") {
    return {
      ...node,
      value: formatFilterDecimal(node.value),
    };
  }

  return node;
}

export function normalizeFilterGroup(group: FilterGroup): FilterGroup {
  return normalizeFilterNode(group) as FilterGroup;
}

export function collectionFilterMetadata(
  collectionName: string,
  catalog: Collection[],
): {
  labels: Map<string, string>;
  choices: Map<string, { value: string; label: string }[]>;
} {
  const collection = catalog.find((entry) => entry.name === collectionName);
  if (!collection) {
    return {
      labels: new Map(),
      choices: new Map(),
    };
  }

  const fields = filterFields(collection, catalog);
  const labels = new Map(fields.map((field) => [field.name, field.label]));
  const choices = new Map(
    fields.map((field) => [field.name, field.options ?? []]),
  );
  return { labels, choices };
}

export function isNarrowViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(max-width: 639px)").matches;
  }
  return window.innerWidth < 640;
}

export function formatSelectionCount(
  selection: { count?: string | number | null; total?: string | number | null },
  locale?: string,
): string | null {
  const raw = selection.count ?? selection.total;
  if (raw === null || raw === undefined) {
    return null;
  }

  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  if (/^-?\d+$/.test(text)) {
    const parsed = Number(text);
    if (Number.isSafeInteger(parsed)) {
      return new Intl.NumberFormat(locale).format(parsed);
    }
  }

  return formatFilterDecimal(text);
}

export function formatSelectionDescription(
  baseText: string,
  searchClause: string | null,
  countNotice: string | null,
): string {
  const sentence = searchClause
    ? `${baseText} ${searchClause}.`
    : `${baseText}.`;
  return countNotice ? `${sentence} ${countNotice}` : sentence;
}
