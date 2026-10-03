import type { AssistantSelection } from "@asmblyr/contracts";
import { captureSelection } from "./selections.js";
import { aggregateGroupFilter } from "../tools/aggregate-filter.js";

interface WireGroup {
  logic: "and" | "or";
  children: object[];
}

function group(value: unknown): value is WireGroup {
  if (!value || typeof value !== "object") return false;
  return (
    "logic" in value &&
    (value.logic === "and" || value.logic === "or") &&
    "children" in value &&
    Array.isArray(value.children)
  );
}

/** Turn-specific navigation is built from full group keys, never model arguments. */
export function captureAggregateSelections(result: object): {
  result: object;
  selections: AssistantSelection[];
} {
  const selections: AssistantSelection[] = [];
  const source = result as Record<string, unknown>;
  const conditions = source.conditions as { q?: string; filter?: unknown } | undefined;
  if (!Array.isArray(source.groups) || !conditions || !group(conditions.filter))
    return { result, selections };
  const base = conditions.filter;
  const groups = source.groups.map((raw: Record<string, unknown>) => {
    if (
      !raw.values ||
      raw.selectable !== true ||
      typeof raw.values !== "object" ||
      !Array.isArray(raw.truncatedFields) ||
      raw.truncatedFields.length
    )
      return { ...raw, resultId: null };
    for (const value of Object.values(raw.values)) {
      if (value !== null && (typeof value !== "string" || value.length > 255))
        return { ...raw, resultId: null };
    }
    const filter = aggregateGroupFilter(base, raw.values as Record<string, string | null>);
    const selection = captureSelection("count_items", {
      ...source,
      conditions: { ...conditions, filter },
      count: raw.count,
    });
    if (!selection) return { ...raw, resultId: null };
    selections.push(selection);
    return { ...raw, resultId: selection.resultId };
  });
  return { result: { ...result, groups }, selections };
}
