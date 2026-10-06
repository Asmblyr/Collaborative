import type { FieldPresentation } from "./index.js";
import type { JsonValue } from "./items.js";

export type SystemCollectionName =
  | "users"
  | "files"
  | "policies"
  | "workspaces"
  | "service_accounts";
export interface SystemCollectionField {
  name: string;
  type: string;
  managed: boolean;
  required: boolean;
  nullable: boolean;
  defaultValue?: JsonValue;
  presentation?: FieldPresentation;
}
export interface SystemCollection {
  name: SystemCollectionName;
  fields: SystemCollectionField[];
}
export interface SystemCollectionRecord {
  id: string;
  label: string;
  values: Record<string, JsonValue>;
}
export interface SystemRecordPage {
  records: SystemCollectionRecord[];
  page: number;
  hasMore: boolean;
}
