/** Superuser-curated, read-only projection rooted in custom user fields. */
export interface ProfileDisplayEntry {
  id: string;
  label: string;
  path: string[];
  selfVisible: boolean;
}

export interface ProfileDisplayConfiguration {
  title: string;
  entries: ProfileDisplayEntry[];
}

export type ProfileDisplayValueType =
  | "text"
  | "email"
  | "integer"
  | "bigint"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "tags"
  | "user";

export interface ProfileDisplaySource {
  name: string;
  label: string;
  type: ProfileDisplayValueType | "relation";
}

export interface ProfileDisplayValue {
  id: string;
  label: string;
  type: ProfileDisplayValueType;
  value: string | number | boolean | string[] | null;
}

export interface ProfileDisplayResult {
  title: string;
  entries: ProfileDisplayValue[];
}
