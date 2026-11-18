import type { RecordDraft } from "./record-draft-model";
import type { Item } from "./types";

export interface PreloadedRecordSnapshot {
  id: string;
  data: Item;
  label?: string;
}

export interface RecordEditorRequest {
  collection: string;
  id?: string;
  itemEndpoint?: string;
  title?: string;
  description?: string;
  omitFields?: string[];
  onSaved?: (id: string) => void;
  draft?: RecordDraft;
  initialValues?: Item;
  initialRecord?: PreloadedRecordSnapshot;
  onDraft?: (draft: RecordDraft) => void;
  leadField?: string;
  extraDirty?: boolean;
}
