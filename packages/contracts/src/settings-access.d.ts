export type SettingsSection =
  | "users"
  | "policies"
  | "plugins"
  | "assistant"
  | "terms"
  | "services"
  | "oauth"
  | "files";

export const settingsSections: readonly SettingsSection[];

export interface SettingsAccess {
  sections: SettingsSection[];
  editableSections: SettingsSection[];
  canManagePolicies: boolean;
  delegatablePolicyIds: string[];
}

export interface UserDelegationInput {
  policyIds: string[];
}

export interface PolicyUsersInput {
  userIds: string[];
}

export interface SettingsPermissionInput {
  section: SettingsSection;
  action: "read" | "update";
  fields: ["*"];
}
