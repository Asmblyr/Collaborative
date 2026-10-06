import type { JsonValue } from "@asmblyr-collaborative/contracts";
import type {
  CollectionDefinition,
  CollectionFieldDefinition,
} from "./collection.js";

interface FieldValues {
  text: string;
  email: string;
  uuid: string;
  integer: number;
  bigint: string;
  date: string;
  decimal: string;
  boolean: boolean;
  datetime: string;
  json: JsonValue;
  file: string;
  files: string[];
}

type FieldValue<Field extends CollectionFieldDefinition> =
  | FieldValues[Field["type"]]
  | (Field["nullable"] extends true ? null : never);

type InputValue<Field extends CollectionFieldDefinition> =
  Field["type"] extends "decimal"
    ? string | number
    : FieldValues[Field["type"]];

type FieldInput<Field extends CollectionFieldDefinition> =
  | Exclude<InputValue<Field>, null>
  | (Field extends { nullable: true; required: false } ? null : never);

type PrimaryValue<Definition extends CollectionDefinition> =
  Definition["primaryKey"]["type"] extends "serial" ? number : string;

type PrimaryRow<Definition extends CollectionDefinition> = {
  [Name in Definition["primaryKey"]["name"]]: PrimaryValue<Definition>;
};

type TimestampRow<Definition extends CollectionDefinition> =
  (Definition extends {
    timestamps: { createdAt: true };
  }
    ? { created_at: string }
    : unknown) &
    (Definition extends { timestamps: { updatedAt: true } }
      ? { updated_at: string }
      : unknown);

/** Full storage row. Datetimes are ISO strings; decimal and bigint precision is preserved. */
export type CollectionRow<Definition extends CollectionDefinition> = {
  -readonly [Name in keyof Definition["fields"]]: FieldValue<
    Definition["fields"][Name]
  >;
} & PrimaryRow<Definition> &
  TimestampRow<Definition>;

type RequiredFields<Definition extends CollectionDefinition> = {
  [Name in keyof Definition["fields"]]: Definition["fields"][Name] extends {
    defaultValue: unknown;
  }
    ? never
    : Definition["fields"][Name] extends
          | { required: true }
          | { nullable: false }
      ? Name
      : never;
}[keyof Definition["fields"]];

type FieldInputs<Definition extends CollectionDefinition> = {
  -readonly [Name in keyof Definition["fields"]]: FieldInput<
    Definition["fields"][Name]
  >;
};

type PrimaryInput<Definition extends CollectionDefinition> =
  Definition["primaryKey"]["type"] extends "text"
    ? PrimaryRow<Definition>
    : Partial<Record<Definition["primaryKey"]["name"], never>>;

export type CollectionCreate<Definition extends CollectionDefinition> = Pick<
  FieldInputs<Definition>,
  RequiredFields<Definition>
> &
  Partial<Omit<FieldInputs<Definition>, RequiredFields<Definition>>> &
  PrimaryInput<Definition>;

export type CollectionUpdate<Definition extends CollectionDefinition> = Partial<
  FieldInputs<Definition>
>;
