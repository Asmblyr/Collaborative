import type { Collection } from "./types";
import type { ItemColumn } from "./item-columns";

const SYSTEM_TIMESTAMP_COLUMNS = new Set(["created_at", "updated_at"]);

/**
 * Returns column names that should be hidden by default when the user has not
 * explicitly customized column visibility for a collection.
 *
 * Raw UUID primary key columns are hidden by default whenever the collection
 * exposes at least one other human-readable field; power users can still
 * re-enable the ID column from the «Вид» menu.
 */
export function defaultHiddenColumnNames(
  primaryKey: Collection["primaryKey"],
  columns: readonly ItemColumn[],
): string[] {
  if (primaryKey.type !== "uuid") {
    return [];
  }
  if (!columns.some((column) => column.name === primaryKey.name)) {
    return [];
  }
  const hasHumanReadableField = columns.some(
    (column) =>
      column.name !== primaryKey.name &&
      !SYSTEM_TIMESTAMP_COLUMNS.has(column.name) &&
      (column.type !== "uuid" || Boolean(column.relation)),
  );
  return hasHumanReadableField ? [primaryKey.name] : [];
}
