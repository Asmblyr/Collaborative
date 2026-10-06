export interface CollectionSource {
  sourceKind?: "table" | "materialized-view";
}

export class CollectionReadOnlyError extends Error {
  readonly statusCode = 403;
  readonly code = "COLLECTION_READ_ONLY";
  constructor() {
    super("Materialized views are available for reading only");
  }
}

export class MaterializedViewNotPopulatedError extends Error {
  readonly statusCode = 503;
  readonly code = "MATERIALIZED_VIEW_NOT_POPULATED";
  constructor() {
    super("Materialized view has not been populated by its external process");
  }
}

export function assertCollectionWritable(source: CollectionSource): void {
  if (source.sourceKind === "materialized-view") {
    throw new CollectionReadOnlyError();
  }
}
