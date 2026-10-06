import type {
  ItemListOptions,
  ItemListResult,
} from "@asmblyr-collaborative/contracts";
import type { ReadableItem } from "../items.js";
import type { RequestOptions } from "../options.js";
import type { FieldDefinition } from "./definition.js";
import {
  createField,
  fieldName,
  sortValue,
  type FieldRef,
  type QueryField,
  type SortRef,
} from "./field.js";
import { Predicate, predicateGroup } from "./predicate.js";
type Names<Row> = Extract<keyof Row, string>;
export type QueryFields<
  Row,
  Definitions extends Record<string, FieldDefinition>,
> = {
  readonly [Name in Names<Row>]: QueryField<Row[Name], Name, Definitions[Name]>;
};
export interface CollectionQuery<
  Row,
  Definitions extends Record<string, FieldDefinition>,
  Selected extends Names<Row> = Names<Row>,
> {
  select<const Field extends Names<Row>>(
    selection: (
      fields: QueryFields<Row, Definitions>,
    ) => readonly FieldRef<unknown, Field>[],
  ): CollectionQuery<Row, Definitions, Field>;
  where(
    predicate: (fields: QueryFields<Row, Definitions>) => Predicate,
  ): CollectionQuery<Row, Definitions, Selected>;
  orderBy(
    sort: (fields: QueryFields<Row, Definitions>) => SortRef<Names<Row>>,
  ): CollectionQuery<Row, Definitions, Selected>;
  orderByRelevance(): CollectionQuery<Row, Definitions, Selected>;
  limit(value: number): CollectionQuery<Row, Definitions, Selected>;
  page(value: number): CollectionQuery<Row, Definitions, Selected>;
  search(value: string): CollectionQuery<Row, Definitions, Selected>;
  /** Rows only. Use result() when pagination and display labels are needed. */
  exec(request?: RequestOptions): Promise<ReadableItem<Row, Selected>[]>;
  result(
    request?: RequestOptions,
  ): Promise<ItemListResult<ReadableItem<Row, Selected>>>;
}
export function createCollectionQuery<
  Row,
  Definitions extends Record<string, FieldDefinition>,
>(
  definitions: Definitions,
  list: (
    options: ItemListOptions,
    request?: RequestOptions,
  ) => Promise<ItemListResult>,
): CollectionQuery<Row, Definitions> {
  const fields = Object.create(null);
  const references = new Set<object>();
  for (const [name, definition] of Object.entries(definitions)) {
    fields[name] = createField(name, definition);
    references.add(fields[name]);
  }
  Object.freeze(fields);
  function build(options: ItemListOptions): CollectionQuery<Row, Definitions> {
    const result = (request?: RequestOptions) => list(options, request);
    return Object.freeze({
      select(
        selection: (fields: QueryFields<Row, Definitions>) => readonly object[],
      ) {
        const selected = selection(fields);
        if (
          !Array.isArray(selected) ||
          !selected.length ||
          selected.some((field) => !references.has(field))
        ) {
          throw new TypeError("select requires fields from this collection");
        }
        return build({
          ...options,
          fields: [...new Set(selected.map(fieldName))],
        });
      },
      where(callback: (fields: QueryFields<Row, Definitions>) => Predicate) {
        const next = callback(fields);
        const filter = options.filter
          ? predicateGroup(new Predicate(options.filter).and(next))
          : predicateGroup(next);
        function verify(
          node: typeof filter | (typeof filter.children)[number],
        ): void {
          if ("logic" in node) {
            node.children.forEach(verify);
          } else if (!Object.hasOwn(fields, node.field)) {
            throw new TypeError(
              "where references a field outside this collection",
            );
          }
        }
        verify(filter);
        return build({ ...options, filter });
      },
      orderBy(callback: (fields: QueryFields<Row, Definitions>) => object) {
        const sort = sortValue(callback(fields));
        if (!Object.hasOwn(fields, sort.name)) {
          throw new TypeError(
            "orderBy references a field outside this collection",
          );
        }
        return build({
          ...options,
          order: "field",
          sort: sort.name,
          direction: sort.direction,
        });
      },
      orderByRelevance() {
        return build({ ...options, order: "relevance" });
      },
      limit(value: number) {
        if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
          throw new TypeError("limit must be an integer from 1 to 100");
        }
        return build({ ...options, limit: value });
      },
      page(value: number) {
        if (!Number.isSafeInteger(value) || value < 1) {
          throw new TypeError("page must be a positive integer");
        }
        return build({ ...options, page: value });
      },
      search(value: string) {
        return build({
          ...options,
          q: value,
          order: options.order ?? "relevance",
        });
      },
      result,
      async exec(request?: RequestOptions) {
        return (await result(request)).data;
      },
    }) as CollectionQuery<Row, Definitions>;
  }
  return build({});
}
