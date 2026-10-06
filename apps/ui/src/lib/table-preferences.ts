import type { ColumnPreferences } from "@asmblyr-collaborative/contracts";
export type { ColumnPreferences } from "@asmblyr-collaborative/contracts";
export interface TablePreferences {
  collectionId: string;
  columns: ColumnPreferences | null;
  pageSize: number;
  hasSaved?: boolean;
  sort: {
    field: string;
    direction: "asc" | "desc";
    order?: import("@asmblyr-collaborative/contracts").ItemOrder;
  };
}
