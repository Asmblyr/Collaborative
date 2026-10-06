import type {
  ItemListOptions,
  ItemListResult,
  ItemReadOptions,
  ItemResult,
  ItemMutationResult,
  ItemCommitDraft,
  ItemCommitResult,
  JsonRecord,
} from "@asmblyr-collaborative/contracts";

/** Bound to the caller of the current endpoint. Do not cache between requests. */
export interface ItemsReader {
  list(collection: string, options?: ItemListOptions): Promise<ItemListResult>;
  /** Pass large integer IDs as strings; numbers must be safe integers. */
  get(
    collection: string,
    id: string | number,
    options?: ItemReadOptions,
  ): Promise<ItemResult>;
}

/** All operations run with the permissions and identity of the current caller. */
export interface ItemsService extends ItemsReader {
  create(collection: string, values: JsonRecord): Promise<ItemMutationResult>;
  update(
    collection: string,
    id: string | number,
    values: JsonRecord,
  ): Promise<ItemMutationResult>;
  delete(collection: string, id: string | number): Promise<void>;
  commit(collection: string, draft: ItemCommitDraft): Promise<ItemCommitResult>;
}
