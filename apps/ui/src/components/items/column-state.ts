import {
  reconcileColumnWidths,
  type ColumnPreferences,
} from "@asmblyr-collaborative/contracts";

export function reconcileColumns(
  raw: string,
  names: string[],
  defaultHidden: readonly string[] = [],
): ColumnPreferences {
  let saved: { order?: unknown; hidden?: unknown; widths?: unknown } = {};
  let hasExplicitHidden = false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      saved = parsed;
      hasExplicitHidden = Array.isArray(saved.hidden);
    }
  } catch {
    /* Ignore invalid legacy local preferences. */
  }
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter(
          (name): name is string =>
            typeof name === "string" && names.includes(name),
        )
      : [];
  const order = [...new Set([...list(saved.order), ...names])];
  const hidden = hasExplicitHidden
    ? [...new Set(list(saved.hidden))]
    : [...new Set(list(defaultHidden))];
  return {
    order,
    hidden: hidden.length >= order.length ? [] : hidden,
    widths: reconcileColumnWidths(saved.widths, names),
  };
}
