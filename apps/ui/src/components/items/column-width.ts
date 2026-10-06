import { columnWidthLimits } from "@asmblyr-collaborative/contracts";
import type { ItemColumn } from "./item-columns";

export function clampColumnWidth(width: number) {
  return Math.min(
    columnWidthLimits.max,
    Math.max(columnWidthLimits.min, Math.round(width)),
  );
}

export function defaultColumnWidth(
  column: ItemColumn,
  labelField: string | undefined,
  primaryKey: string,
) {
  if (column.name === labelField && column.name !== primaryKey) {
    return 360;
  }
  if (column.name === primaryKey) {
    return 148;
  }
  if (column.relation) {
    return 260;
  }
  if (column.type === "datetime") {
    return 220;
  }
  if (column.type === "email") {
    return 224;
  }
  return column.type === "boolean" ? 112 : 160;
}

/** Preview only the colgroup; the row tree and saved preferences stay untouched. */
export function beginColumnResize(
  handle: HTMLElement,
  name: string,
  startX: number,
) {
  const table = handle.closest("table");
  const column = Array.from(
    table?.querySelectorAll<HTMLTableColElement>("col[data-column-size]") ?? [],
  ).find((entry) => entry.dataset.columnSize === name);
  if (!table || !column) {
    return null;
  }
  const originalWidth = column.style.width;
  const originalMinWidth = table.style.minWidth;
  const originalSelect = table.style.userSelect;
  const startWidth = Number.parseFloat(originalWidth);
  const startMinWidth = Number.parseFloat(originalMinWidth);
  if (!Number.isFinite(startWidth) || !Number.isFinite(startMinWidth)) {
    return null;
  }
  let width = startWidth;
  table.style.userSelect = "none";
  return {
    get width() {
      return width;
    },
    startWidth,
    update(clientX: number) {
      width = clampColumnWidth(startWidth + clientX - startX);
      column.style.width = `${width}px`;
      table.style.minWidth = `${startMinWidth + width - startWidth}px`;
      return width;
    },
    restore() {
      column.style.width = originalWidth;
      table.style.minWidth = originalMinWidth;
      table.style.userSelect = originalSelect;
    },
  };
}
