import type { ReadRow } from "../collection-schema.js";
import type { Transport } from "../transport.js";
import { collectionPath, itemListQuery } from "../item-query.js";
import type { FieldDefinition } from "./definition.js";
import type { ClientSchema, FieldDefinitions } from "./definition.js";
import { createCollectionQuery, type CollectionQuery } from "./collection.js";
type Name<Schema> = Extract<keyof Schema, string>;
type ReadableName<Schema> = {
  [Key in Name<Schema>]: [ReadRow<Schema[Key]>] extends [never] ? never : Key;
}[Name<Schema>];
export type FluentClient<
  Schema extends object,
  Fields extends FieldDefinitions<Schema>,
  Aliases extends Record<string, Name<Schema>>,
> = {
  readonly [Alias in keyof Aliases]: CollectionQuery<
    ReadRow<Schema[Aliases[Alias]]>,
    Fields[Aliases[Alias]]
  >;
} & {
  collection<Key extends ReadableName<Schema>>(
    name: Key,
  ): CollectionQuery<ReadRow<Schema[Key]>, Fields[Key]>;
};
export function createFluentClient<
  Schema extends object,
  Fields extends FieldDefinitions<Schema>,
  Aliases extends Record<string, Name<Schema>>,
  Methods extends object,
>(
  schema: ClientSchema<Schema, Fields, Aliases, Methods>,
  transport: Transport,
): FluentClient<Schema, Fields, Aliases> {
  const queries = Object.create(null);
  const result = Object.create(null);
  const definitions = schema.fields as Record<
    string,
    Record<string, FieldDefinition>
  >;
  for (const [name, fields] of Object.entries(definitions)) {
    queries[name] = createCollectionQuery(fields, (options, request) =>
      transport.get(collectionPath(name), itemListQuery(options), request),
    );
  }
  result.collection = (name: string) => {
    if (!Object.hasOwn(queries, name)) {
      throw new TypeError("Collection is absent from the generated schema");
    }
    return queries[name];
  };
  for (const [alias, name] of Object.entries(schema.aliases)) {
    Object.defineProperty(result, alias, {
      value: result.collection(name),
      enumerable: true,
    });
  }
  return result;
}
