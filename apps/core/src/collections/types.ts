import type { FieldPresentation } from "./field-presentation-validation.js";
import type { JsonValue } from "./structured-values.js";
import type { FormLayout } from "./form-layout.js";
import type {
  CollectionMode,
  CollectionState,
  FieldType,
  PrimaryKey,
  Timestamps,
} from "@asmblyr/contracts";
export type {
  CollectionMode,
  FieldType,
  PrimaryKey,
  PrimaryKeyType,
  Timestamps,
} from "@asmblyr/contracts";

export interface CollectionField {
  name: string;
  type: FieldType;
  required: boolean;
  nullable: boolean;
  defaultValue?: JsonValue;
  searchable?: boolean;
}

export interface CreateCollectionInput {
  name: string;
  displayName: string | null;
  hidden: boolean;
  mcp: { enabled: boolean; description: string | null };
  folderId: string | null;
  parentCollection: string | null;
  workspaceId?: string;
  mode: CollectionMode;
  primaryKey: PrimaryKey;
  timestamps: Timestamps;
  state: CollectionState | null;
  fields: CollectionField[];
}

export interface Collection {
  name: string;
  displayName?: string | null;
  hidden?: boolean;
  mcp?: { enabled: boolean; description: string | null };
  displayField?: string | null;
  displayTemplate?: string | null;
  formLayout?: FormLayout | null;
  folderId: string | null;
  parentCollection?: string | null;
  mode: CollectionMode;
  primaryKey: PrimaryKey;
  timestamps: Timestamps;
  state?: CollectionState | null;
  fields: {
    name: string;
    type: string;
    required: boolean;
    nullable: boolean;
    defaultValue?: JsonValue;
    searchable?: boolean;
    searchIndexed?: boolean;
    presentation?: FieldPresentation;
    relation?:
      | {
          kind: "m2o";
          collection: string;
          primaryKey: PrimaryKey;
          onDelete: "restrict" | "setNull" | "setDefault" | "cascade";
        }
      | {
          kind: "o2m" | "m2m";
          collection: string;
          throughCollection: string;
          throughField: string;
          relatedField?: string;
        };
  }[];
  createdAt: Date;
}
