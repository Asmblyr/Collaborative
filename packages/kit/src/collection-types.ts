import type { JsonValue } from "@asmblyr-collaborative/contracts";
import type {
  CollectionDefinition,
  CollectionFieldDefinition,
} from "./collection.js";

export interface CollectionFieldValues {
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

export type CollectionFieldValue<Field extends CollectionFieldDefinition> =
  | CollectionFieldValues[Field["type"]]
  | (Field["nullable"] extends true ? null : never);

export type CollectionFieldInput<Field extends CollectionFieldDefinition> =
  | Exclude<
      Field["type"] extends "decimal"
        ? string | number
        : CollectionFieldValues[Field["type"]],
      null
    >
  | (Field extends { nullable: true; required: false } ? null : never);

export type CollectionPrimaryRow<Definition extends CollectionDefinition> = {
  [Name in Definition["primaryKey"]["name"]]: Definition["primaryKey"]["type"] extends "serial"
    ? number
    : string;
};

export type CollectionTimestampRow<Definition extends CollectionDefinition> =
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
  -readonly [Name in keyof Definition["fields"]]: CollectionFieldValue<
    Definition["fields"][Name]
  >;
} & CollectionPrimaryRow<Definition> &
  CollectionTimestampRow<Definition>;

export type CollectionRequiredFields<Definition extends CollectionDefinition> =
  {
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

export type CollectionFieldInputs<Definition extends CollectionDefinition> = {
  -readonly [Name in keyof Definition["fields"]]: CollectionFieldInput<
    Definition["fields"][Name]
  >;
};

export type CollectionPrimaryInput<Definition extends CollectionDefinition> =
  Definition["primaryKey"]["type"] extends "text"
    ? CollectionPrimaryRow<Definition>
    : Partial<Record<Definition["primaryKey"]["name"], never>>;

export type CollectionCreate<Definition extends CollectionDefinition> = Pick<
  CollectionFieldInputs<Definition>,
  CollectionRequiredFields<Definition>
> &
  Partial<
    Omit<
      CollectionFieldInputs<Definition>,
      CollectionRequiredFields<Definition>
    >
  > &
  CollectionPrimaryInput<Definition>;

export type CollectionUpdate<Definition extends CollectionDefinition> = Partial<
  CollectionFieldInputs<Definition>
>;
