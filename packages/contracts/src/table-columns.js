export const columnWidthLimits = Object.freeze({
  min: 80,
  max: 1200,
  step: 16,
});

export function isColumnWidth(value) {
  return (
    Number.isInteger(value) &&
    value >= columnWidthLimits.min &&
    value <= columnWidthLimits.max
  );
}

/** Ignore stale or invalid widths when reading saved preferences. */
export function reconcileColumnWidths(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const allowed = new Set(names);
  return Object.fromEntries(
    Object.entries(value).filter(
      ([name, width]) => allowed.has(name) && isColumnWidth(width),
    ),
  );
}
