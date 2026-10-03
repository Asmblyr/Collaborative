import type { RecordDraft } from "./record-draft-model";
import type { Item } from "./types";

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
  onDraft?: (draft: RecordDraft) => void;
  leadField?: string;
  extraDirty?: boolean;
}
