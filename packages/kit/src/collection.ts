import type {
  CollectionMode,
  FieldPresentation,
  FieldType,
  JsonValue,
  PrimaryKey,
  Timestamps,
} from "@asmblyr/contracts";

interface FieldDefinitionBase {
  readonly type: FieldType;
  /** Require a non-empty value in the API, independently of database nullability. */
  readonly required: boolean;
  /** Whether the physical column permits SQL NULL. */
  readonly nullable: boolean;
  readonly presentation?: Readonly<Partial<FieldPresentation>>;
}

type TextFieldDefinition = {
  readonly type: "text" | "email";
  readonly defaultValue?: string;
  readonly searchable?: boolean;
};

type OtherFieldDefinition = { readonly searchable?: never } & (
  | { readonly type: "uuid" | "datetime"; readonly defaultValue?: string }
  | { readonly type: "integer"; readonly defaultValue?: number }
  | { readonly type: "decimal"; readonly defaultValue?: string | number }
  | { readonly type: "boolean"; readonly defaultValue?: boolean }
  | { readonly type: "json"; readonly defaultValue?: Exclude<JsonValue, null> }
  | { readonly type: "file" | "files"; readonly defaultValue?: never }
);

export type CollectionFieldDefinition = FieldDefinitionBase &
  (TextFieldDefinition | OtherFieldDefinition);

export interface CollectionPresentation {
  readonly displayName?: string;
  /** Navigation visibility only; this does not grant or restrict access. */
  readonly hidden?: boolean;
}

/** Declaration installed by Core within the owning plugin's namespace. */
export interface CollectionDefinition<Name extends string = string> {
  /** Local name matching the filename; Core prefixes it with plugin_<namespace>_. */
  readonly name: Name;
  readonly mode?: CollectionMode;
  readonly primaryKey: Readonly<PrimaryKey>;
  readonly timestamps?: Readonly<Timestamps>;
  readonly presentation?: CollectionPresentation;
  /** Keys are field names; primary key and system dates are declared above. */
  readonly fields: Readonly<Record<string, CollectionFieldDefinition>>;
}

/** Describes a collection without validating it at runtime or changing the database. */
export function defineCollection<const Definition extends CollectionDefinition>(
  definition: Definition & Record<Exclude<keyof Definition, keyof CollectionDefinition>, never>,
): Definition {
  return definition;
}
