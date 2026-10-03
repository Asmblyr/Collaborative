import type { ItemFilterGroup } from "./item-filter.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;
/** Also usable for in-process reads, whose dates may still be Date objects. */
export type ItemRecord = Record<string, unknown>;

export interface ItemReadOptions<Field extends string = string> {
  /** Omit for all readable fields. The primary key is always included. */
  readonly fields?: readonly Field[];
}

export interface ItemListOptions<Field extends string = string>
  extends ItemReadOptions<Field> {
  /** One-based page number. Defaults to 1. */
  readonly page?: number;
  /** 1–100 records. Defaults to 100. */
  readonly limit?: number;
  readonly sort?: Field;
  readonly direction?: "asc" | "desc";
  readonly q?: string;
  readonly filter?: ItemFilterGroup;
}

export interface ItemPage {
  number: number;
  size: number;
  /** String to preserve PostgreSQL bigint precision. */
  total: string;
  sort: string;
  direction: "asc" | "desc";
}

export interface ItemListResult<Row extends object = ItemRecord> {
  data: Row[];
  /** Labels may use readable fields outside the requested projection. */
  labels: Record<string, string>;
  page: ItemPage;
}

export interface ItemResult<Row extends object = ItemRecord> {
  data: Row;
  label: string;
}

/** Successful writes can return no data when the caller has no read permission. */
export interface ItemMutationResult<Row extends object = ItemRecord> {
  data: Row | null;
}
