/** Field types supported by Core's collection schema. */
export type FieldType =
  | "text"
  | "integer"
  | "boolean"
  | "datetime"
  | "email"
  | "decimal"
  | "json"
  | "uuid"
  | "file"
  | "files";

export type CollectionMode = "multiple" | "single";
export type PrimaryKeyType = "uuid" | "serial" | "bigserial" | "text";

export interface PrimaryKey {
  name: string;
  type: PrimaryKeyType;
}

export interface Timestamps {
  createdAt: boolean;
  updatedAt: boolean;
}
