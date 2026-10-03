import type {
  FormLayout,
  FieldPresentation,
  CollectionState,
} from "@asmblyr/contracts";
export type {
  FieldPresentation,
  RelationPresentation,
} from "@asmblyr/contracts";

export interface CollectionField {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  defaultValue?: ItemValue;
  searchable?: boolean;
  searchIndexed?: boolean;
  presentation?: FieldPresentation;
  relation?:
    | {
        kind: "m2o";
        collection: string;
        primaryKey: Collection["primaryKey"];
        onDelete: "restrict" | "setNull" | "setDefault" | "cascade";
      }
    | {
        kind: "o2m" | "m2m";
        collection: string;
        throughCollection: string;
        throughField: string;
        relatedField?: string;
      };
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
  mode: "multiple" | "single";
  primaryKey: { name: string; type: "uuid" | "serial" | "bigserial" | "text" };
  timestamps: { createdAt: boolean; updatedAt: boolean };
  state?: CollectionState | null;
  fields: CollectionField[];
  access: {
    create: string[] | null;
    read: string[] | null;
    update: string[] | null;
    delete: boolean;
    structure: boolean;
  };
}

export interface CollectionFolder {
  id: string;
  name: string;
}

export type ItemValue =
  | string
  | number
  | boolean
  | null
  | ItemValue[]
  | { [key: string]: ItemValue };
export type Item = Record<string, ItemValue>;

export interface ItemPage {
  number: number;
  size: number;
  total: string;
  sort: string;
  direction: "asc" | "desc";
}

export interface ItemList {
  data: Item[];
  page: ItemPage;
  labels?: Record<string, string>;
}

export interface ItemEvent {
  id: string;
  item_id: string;
  action: "create" | "update" | "delete";
  occurred_at: string;
  actor_kind: "anonymous" | "user" | "service";
  actor_id: string | null;
  request_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}
