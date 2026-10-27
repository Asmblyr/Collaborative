import type { ColumnPreferences } from "@asmblyr-collaborative/contracts";
export type { ColumnPreferences } from "@asmblyr-collaborative/contracts";
export interface TablePreferences {
  collectionId: string;
  columns: ColumnPreferences | null;
  pageSize: number;
  hasSaved?: boolean;
  filter?: import("@asmblyr-collaborative/contracts").ItemFilterGroup | null;
  sort: {
    field: string;
    direction: "asc" | "desc";
    order?: import("@asmblyr-collaborative/contracts").ItemOrder;
  };
}

export type TableQueryPatch = Partial<
  Pick<TablePreferences, "pageSize" | "sort" | "filter">
>;

/** Filter object key order can differ between URLs and PostgreSQL JSONB. */
export function tableQuerySnapshot(value: TableQueryPatch): string {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return Object.fromEntries(
        Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return entry;
  });
}
