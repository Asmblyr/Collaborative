import {
  settingsSections,
  type SettingsPermissionInput,
} from "@asmblyr-collaborative/contracts";
import type { Permission } from "./types";

export function policySettingsDraft(
  policyId: string | undefined,
  permissions: Permission[],
): SettingsPermissionInput[] {
  const grants = new Map<string, SettingsPermissionInput>();
  for (const permission of permissions) {
    if (
      !("section" in permission) ||
      !policyId ||
      !permission.policyIds.includes(policyId)
    ) {
      continue;
    }
    if (grants.get(permission.section)?.action === "update") {
      continue;
    }
    grants.set(permission.section, {
      section: permission.section,
      action: permission.action,
      fields: ["*"],
    });
  }
  return settingsSections.flatMap((section) => {
    const grant = grants.get(section);
    return grant ? [grant] : [];
  });
}
