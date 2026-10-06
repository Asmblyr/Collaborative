import type { SchemaFilterKind } from "@asmblyr-collaborative/contracts";
import type { ReadRow } from "../collection-schema.js";
import { copyPluginPaths, type PluginPaths } from "../plugins.js";
export interface FieldDefinition {
  readonly kind: SchemaFilterKind;
  readonly nullable: boolean;
}
export type FieldDefinitions<Schema extends object> = {
  readonly [Name in keyof Schema]: {
    readonly [Field in Extract<
      keyof ReadRow<Schema[Name]>,
      string
    >]: FieldDefinition;
  };
};
declare const schemaType: unique symbol;
declare const methodsType: unique symbol;
export interface ClientSchema<
  Schema extends object,
  Fields extends FieldDefinitions<Schema>,
  Aliases extends Record<string, Extract<keyof Schema, string>>,
  Methods extends object = {},
> {
  readonly [schemaType]: Schema;
  readonly [methodsType]: Methods;
  readonly fields: Fields;
  readonly aliases: Aliases;
  readonly plugins: PluginPaths<Methods>;
}
/** Attach ordinary TS row types to a small, browser-safe field descriptor. */
export function defineSchema<
  Schema extends object,
  Methods extends object = {},
>() {
  return <
    const Fields extends FieldDefinitions<Schema>,
    const Aliases extends Record<string, Extract<keyof Schema, string>>,
  >(
    fields: Fields,
    aliases: Aliases,
    plugins: PluginPaths<Methods> = {} as PluginPaths<Methods>,
  ): ClientSchema<Schema, Fields, Aliases, Methods> => {
    // The type brand has no runtime payload. Copy inputs to isolate caller mutation.
    const copied = Object.create(null) as Fields;
    const descriptors = fields as Record<
      string,
      Record<string, FieldDefinition>
    >;
    for (const [name, definitions] of Object.entries(descriptors)) {
      if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
        throw new TypeError("Invalid collection descriptor");
      }
      const entries = Object.create(null);
      for (const [field, definition] of Object.entries(definitions)) {
        if (
          !/^[a-z][a-z0-9_]{0,62}$/.test(field) ||
          !["text", "ordered", "scalar", "none"].includes(definition.kind) ||
          typeof definition.nullable !== "boolean"
        ) {
          throw new TypeError("Invalid field descriptor");
        }
        entries[field] = Object.freeze({ ...definition });
      }
      Object.defineProperty(copied, name, {
        value: Object.freeze(entries),
        enumerable: true,
      });
    }
    const names = Object.create(null) as Aliases;
    for (const [alias, name] of Object.entries(aliases)) {
      if (!/^[A-Z][A-Za-z0-9_]*$/.test(alias) || !Object.hasOwn(copied, name)) {
        throw new TypeError("Invalid collection alias");
      }
      Object.defineProperty(names, alias, { value: name, enumerable: true });
    }
    return Object.freeze({
      fields: Object.freeze(copied),
      aliases: Object.freeze(names),
      plugins: copyPluginPaths(plugins),
    }) as ClientSchema<Schema, Fields, Aliases, Methods>;
  };
}
