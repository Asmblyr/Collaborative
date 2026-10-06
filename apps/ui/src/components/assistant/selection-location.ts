import type { AssistantSelectionQuery } from "@asmblyr-collaborative/contracts";

export function selectionHref(selection: AssistantSelectionQuery): string {
  const query = new URLSearchParams({
    page: "1",
    q: selection.q,
    filter: JSON.stringify(selection.filter),
    sort: selection.sort,
    direction: selection.direction,
    order: selection.order ?? "field",
  });
  // Explicit empty conditions override saved views and the published-state default.
  return `/items/${encodeURIComponent(selection.collection)}?${query}`;
}
