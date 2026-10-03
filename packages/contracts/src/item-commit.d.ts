import type { JsonRecord } from "./items.js";

/** A record and its related changes, saved in one transaction. IDs are strings. */
export interface ItemCommitDraft<Values extends object = JsonRecord> {
  id?: string;
  values: Values;
  /** Original values of every field being updated. A mismatch returns ITEM_CHANGED (409). */
  expectedValues?: Partial<Values>;
  references?: Record<string, ItemCommitDraft<Values>>;
  relations?: Record<string, ItemCommitRelation<Values>>;
  records?: { collection: string; record: ItemCommitDraft<Values> }[];
}

export interface ItemCommitRelation<Values extends object = JsonRecord> {
  attach?: { id: string; record?: ItemCommitDraft<Values> }[];
  detach?: string[];
  create?: {
    record: ItemCommitDraft<Values>;
    link?: ItemCommitDraft<Values>;
  }[];
  links?: { id: string; record: ItemCommitDraft<Values> }[];
}

export interface ItemCommitResult {
  data: { id: string };
}
