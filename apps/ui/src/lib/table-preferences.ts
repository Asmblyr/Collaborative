export interface ColumnPreferences {
  order: string[];
  hidden: string[];
}
export interface TablePreferences {
  collectionId: string;
  columns: ColumnPreferences | null;
  pageSize: number;
  hasSaved?: boolean;
  sort: { field: string; direction: "asc" | "desc" };
}
