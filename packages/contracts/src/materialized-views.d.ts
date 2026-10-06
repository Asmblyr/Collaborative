import type { FieldType, PrimaryKey } from "./collections.js";
import type { FieldPresentation } from "./index.js";

export interface MaterializedViewCandidate {
  name: string;
  populated: boolean;
  connected: boolean;
  problem:
    | "unsupported-name"
    | "unsupported-fields"
    | "missing-key"
    | "not-populated"
    | null;
  keys: PrimaryKey[];
  fields: { name: string; type: FieldType | null; nullable: boolean }[];
}

export interface ConnectMaterializedViewInput {
  name: string;
  primaryKey: string;
  displayName?: string | null;
  folderId?: string | null;
  workspaceId?: string | null;
  displayField?: string | null;
  displayTemplate?: string | null;
  presentations?: Record<string, Partial<FieldPresentation>>;
}
