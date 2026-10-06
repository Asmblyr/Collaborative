import type { PrimaryKey, CollectionMode } from "./collections.js";

/** Wire types; date, decimal and bigint are strings, never JS Date/BigInt. */
export type SchemaValueType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "strings";
/** Scalar filter operations actually supported by Core for this field. */
export type SchemaFilterKind = "text" | "ordered" | "scalar" | "none";
export interface SchemaField {
  name: string;
  type: SchemaValueType;
  nullable: boolean;
  read: boolean;
  create: boolean;
  update: boolean;
  requiredOnCreate: boolean;
  enum?: readonly (string | number)[];
  relationKey?: PrimaryKey["type"];
  filterKind?: SchemaFilterKind;
}
export interface SchemaCollection {
  sourceKind?: "table" | "materialized-view";
  name: string;
  mode: CollectionMode;
  primaryKey: PrimaryKey;
  actions: { read: boolean; create: boolean; update: boolean; delete: boolean };
  fields: readonly SchemaField[];
}
export interface SchemaSnapshot {
  version: 1;
  hash: string;
  collections: readonly SchemaCollection[];
  methods?: readonly SchemaPluginMethod[];
}
/** Only generated JSON model handlers; ordinary HTTP/stream endpoints are excluded. */
export interface SchemaPluginMethod {
  namespace: string;
  id: string;
  path: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}
export interface SchemaResult {
  data: SchemaSnapshot;
}
