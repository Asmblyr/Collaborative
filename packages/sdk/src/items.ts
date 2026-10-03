import type {
  ItemListOptions,
  ItemListResult,
  ItemMutationResult,
  ItemCommitDraft,
  ItemCommitResult,
  ItemReadOptions,
  ItemResult,
  JsonRecord,
} from "@asmblyr/contracts";
import {
  collectionPath,
  itemListQuery,
  itemPath,
  itemReadQuery,
} from "./item-query.js";
import type { RequestOptions } from "./options.js";
import type { Transport } from "./transport.js";

export type DynamicSchema = Record<string, JsonRecord>;
type CollectionName<Schema> = Extract<keyof Schema, string>;
type FieldName<Row> = Extract<keyof Row, string>;
/** Permissions can omit fields even when they are required in the collection schema. */
export type ReadableItem<
  Row,
  Fields extends keyof Row = keyof Row,
> = string extends Fields ? Pick<Row, Fields> : Partial<Pick<Row, Fields>>;

export interface ItemsClient<Schema extends object> {
  list<
    Name extends CollectionName<Schema>,
    Field extends FieldName<Schema[Name]> = FieldName<Schema[Name]>,
  >(
    collection: Name,
    options?: Omit<ItemListOptions<FieldName<Schema[Name]>>, "fields"> & {
      readonly fields?: readonly Field[];
    },
    request?: RequestOptions,
  ): Promise<ItemListResult<ReadableItem<Schema[Name], Field>>>;
  get<
    Name extends CollectionName<Schema>,
    Field extends FieldName<Schema[Name]> = FieldName<Schema[Name]>,
  >(
    collection: Name,
    id: string | number,
    options?: ItemReadOptions<Field>,
    request?: RequestOptions,
  ): Promise<ItemResult<ReadableItem<Schema[Name], Field>>>;
  create<Name extends CollectionName<Schema>>(
    collection: Name,
    values: Partial<Schema[Name]>,
    request?: RequestOptions,
  ): Promise<ItemMutationResult<ReadableItem<Schema[Name]>>>;
  update<Name extends CollectionName<Schema>>(
    collection: Name,
    id: string | number,
    values: Partial<Schema[Name]>,
    request?: RequestOptions,
  ): Promise<ItemMutationResult<ReadableItem<Schema[Name]>>>;
  delete<Name extends CollectionName<Schema>>(
    collection: Name,
    id: string | number,
    request?: RequestOptions,
  ): Promise<void>;
  commit<Name extends CollectionName<Schema>>(
    collection: Name,
    draft: Omit<ItemCommitDraft, "values" | "expectedValues"> & {
      values: Partial<Schema[Name]>;
      expectedValues?: Partial<Schema[Name]>;
    },
    request?: RequestOptions,
  ): Promise<ItemCommitResult>;
}

export function createItemsClient<Schema extends object>(
  transport: Transport,
): ItemsClient<Schema> {
  return {
    async list(collection, options, request) {
      return transport.get(
        collectionPath(collection),
        itemListQuery(options),
        request,
      );
    },
    async get(collection, id, options, request) {
      return transport.get(
        itemPath(collection, id),
        itemReadQuery(options),
        request,
      );
    },
    async create(collection, values, request) {
      return transport.write(
        "POST",
        collectionPath(collection),
        values,
        request,
      );
    },
    async update(collection, id, values, request) {
      return transport.write(
        "PATCH",
        itemPath(collection, id),
        values,
        request,
      );
    },
    async delete(collection, id, request) {
      await transport.write(
        "DELETE",
        itemPath(collection, id),
        undefined,
        request,
      );
    },
    async commit(collection, draft, request) {
      return transport.write(
        "POST",
        `${collectionPath(collection)}/commit`,
        draft,
        request,
      );
    },
  };
}
