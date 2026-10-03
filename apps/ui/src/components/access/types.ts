import type {
  PermissionFilter,
  PermissionRule,
  SettingsPermissionInput,
  SettingsSection,
} from "@asmblyr/contracts";
import type { Collection } from "@/components/items/types";

export type PolicyCollection = Pick<
  Collection,
  "name" | "displayName" | "primaryKey" | "timestamps" | "state"
> & {
  fields: {
    name: string;
    type: string;
    nullable?: boolean;
    presentation?: Collection["fields"][number]["presentation"];
    relation?: Collection["fields"][number]["relation"];
  }[];
};

export interface AccessUser {
  id: string;
  email: string;
  status: "active" | "disabled";
  superuser: boolean;
  hasPassword: boolean;
  invitationPending?: boolean;
  hasDelegation: boolean;
  policyIds: string[];
}

export interface Policy {
  id: string;
  name: string;
}
export type Action = "create" | "read" | "update" | "delete";
export type Permission = { id: string; policyIds: string[] } & (
  | {
      collection: string;
      action: Action;
      fields: string[];
      rowFilter?: PermissionFilter | null;
    }
  | SettingsPermissionInput
);

export interface EffectivePermission {
  collection: string;
  action: Action;
  fields: string[];
  rules?: PermissionRule[];
}

export interface UserAccess {
  user: Pick<
    AccessUser,
    "id" | "email" | "status" | "superuser" | "hasPassword"
  >;
  policies: Policy[];
  permissions: EffectivePermission[];
  sections: SettingsSection[];
  editableSections: SettingsSection[];
  canManagePolicies: boolean;
  delegatablePolicyIds: string[];
}

export const actionName: Record<Action, string> = {
  read: "Чтение",
  create: "Создание",
  update: "Изменение",
  delete: "Удаление",
};
