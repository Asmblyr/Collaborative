import {
  reconcileColumnWidths,
  type ColumnPreferences,
} from "@asmblyr-collaborative/contracts";

export function reconcileColumns(
  raw: string,
  names: string[],
): ColumnPreferences {
  let saved: { order?: unknown; hidden?: unknown; widths?: unknown } = {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      saved = parsed;
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
  const hidden = [...new Set(list(saved.hidden))];
  return {
    order,
    hidden: hidden.length >= order.length ? [] : hidden,
    widths: reconcileColumnWidths(saved.widths, names),
  };
}
