export interface ColumnPreferences {
  order: string[];
  hidden: string[];
  /** Per-field widths in CSS pixels; omitted fields use the default width. */
  widths?: Record<string, number>;
}
export const columnWidthLimits: Readonly<{ min: 80; max: 1200; step: 16 }>;
export function isColumnWidth(value: unknown): value is number;
export function reconcileColumnWidths(
  value: unknown,
  names: readonly string[],
): Record<string, number>;
