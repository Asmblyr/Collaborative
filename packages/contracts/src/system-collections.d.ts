import type { FieldPresentation, PrimaryKey } from "./index.js";
import type { JsonValue } from "./items.js";

export type SystemCollectionName =
  | "users"
  | "files"
  | "policies"
  | "workspaces"
  | "service_accounts";
export interface SystemCollectionRelation {
  kind: "m2o";
  collection: string;
  primaryKey: PrimaryKey;
  onDelete: "setNull";
}
export interface SystemCollectionField {
  name: string;
  type: string;
  managed: boolean;
  required: boolean;
  nullable: boolean;
  defaultValue?: JsonValue;
  presentation?: FieldPresentation;
  relation?: SystemCollectionRelation;
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
