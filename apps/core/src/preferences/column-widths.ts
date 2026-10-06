import {
  isColumnWidth,
  reconcileColumnWidths,
} from "@asmblyr-collaborative/contracts";
import { ItemError } from "../items/validation.js";

export function columnWidths(
  value: unknown,
  names: string[],
  reconcile = false,
): { widths?: Record<string, number> } {
  if (value === undefined) {
    return {};
  }
  if (reconcile) {
    return { widths: reconcileColumnWidths(value, names) };
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length > 500 ||
    Object.entries(value).some(
      ([name, width]) => !names.includes(name) || !isColumnWidth(width),
    )
  ) {
    throw new ItemError(
      "Invalid or inaccessible table column widths (80–1200 integer pixels)",
      400,
    );
  }
  return { widths: reconcileColumnWidths(value, names) };
}
