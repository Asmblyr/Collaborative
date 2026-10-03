import type { JsonRecord } from "./items.js";

/** UI-only settings. They never replace server-side field validation. */
export interface FieldExtension {
  /** Namespaced UI contribution, for example color:picker. */
  id: string;
  options: JsonRecord;
}
