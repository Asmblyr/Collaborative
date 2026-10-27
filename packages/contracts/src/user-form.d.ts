import type {
  CurrentUser,
  FormLayout,
  JsonValue,
  SystemCollectionField,
} from "./index.js";

export type UserFieldSelfAccess = "read" | "write";

/** The safe profile schema, never the complete authentication table. */
export interface UserFormConfiguration {
  fields: SystemCollectionField[];
  layout: FormLayout | null;
  selfAccess: Record<string, UserFieldSelfAccess>;
}

export interface UserFormResult {
  canEditAvatar: boolean;
  user: CurrentUser;
  fields: SystemCollectionField[];
  layout: FormLayout | null;
  values: Record<string, JsonValue>;
  readOnlyFields: string[];
}
