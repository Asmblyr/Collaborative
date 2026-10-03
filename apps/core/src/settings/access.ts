import type { Knex } from "knex";
import {
  settingsSections,
  type SettingsSection,
  type SettingsAccess,
} from "@asmblyr/contracts";
import { authenticatePrincipal } from "../auth/principal.js";
import { AccessDeniedError } from "../permissions/access.js";
import { delegatedPolicyIds } from "../policies/delegation-repository.js";

export async function effectiveSettingsAccess(
  database: Knex,
  userId: string,
): Promise<SettingsAccess> {
  const rows = await database("asmblyr_user_policies as assignment")
    .withSchema("public")
    .join(
      "asmblyr_policy_permissions as link",
      "link.policy_id",
      "assignment.policy_id",
    )
    .join(
      "asmblyr_permissions as permission",
      "permission.id",
      "link.permission_id",
    )
    .where("assignment.user_id", userId)
    .whereNull("permission.collection_id")
    .whereIn("permission.action", ["read", "update"])
    .whereNotNull("permission.section")
    .distinct<
      { section: SettingsSection; action: "read" | "update" }[]
    >("permission.section", "permission.action");
  const granted = new Set(rows.map((row) => row.section));
  const editable = new Set(
    rows.filter((row) => row.action === "update").map((row) => row.section),
  );
  return {
    sections: settingsSections.filter((section) => granted.has(section)),
    editableSections: settingsSections.filter((section) =>
      editable.has(section),
    ),
    canManagePolicies: false,
    delegatablePolicyIds: await delegatedPolicyIds(database, userId),
  };
}

export async function loadSettingsAccess(
  database: Knex,
  authorization?: string,
) {
  const user = await authenticatePrincipal(database, authorization);
  if (user.kind !== "user") {
    throw new AccessDeniedError();
  }
  const access = user.superuser
    ? {
        sections: [...settingsSections],
        editableSections: [...settingsSections],
        canManagePolicies: true,
        delegatablePolicyIds: [],
      }
    : await effectiveSettingsAccess(database, user.id);
  return { user, ...access };
}

export async function requireSettingsSection(
  database: Knex,
  request: { headers: { authorization?: string } },
  ...allowed: SettingsSection[]
) {
  const { user, editableSections } = await loadSettingsAccess(
    database,
    request.headers.authorization,
  );
  if (!allowed.some((section) => editableSections.includes(section))) {
    throw new AccessDeniedError();
  }
  return user;
}

export async function requireSettingsRead(
  database: Knex,
  request: { headers: { authorization?: string } },
  ...allowed: SettingsSection[]
) {
  const { user, sections } = await loadSettingsAccess(
    database,
    request.headers.authorization,
  );
  if (!allowed.some((section) => sections.includes(section))) {
    throw new AccessDeniedError();
  }
  return user;
}
