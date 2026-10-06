import {
  settingsSections,
  type SettingsPermissionInput,
  type SettingsSection,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import { PermissionInputError } from "./validation.js";

export function parseSettingsPermission(
  input: Record<string, unknown>,
): SettingsPermissionInput {
  if (
    Object.keys(input).length !== 3 ||
    !settingsSections.includes(input.section as SettingsSection) ||
    (input.action !== "read" && input.action !== "update") ||
    !Array.isArray(input.fields) ||
    input.fields.length !== 1 ||
    input.fields[0] !== "*"
  ) {
    throw new PermissionInputError(
      "Expected a known settings section, read or update action and ['*'] fields",
    );
  }
  return {
    section: input.section as SettingsSection,
    action: input.action,
    fields: ["*"],
  };
}

export async function ensureSettingsPermission(
  database: Knex,
  section: SettingsSection,
  action: SettingsPermissionInput["action"],
): Promise<string> {
  await database("public.asmblyr_permissions")
    .insert({ section, action, fields: ["*"] })
    .onConflict()
    .ignore();
  const permission = await database("public.asmblyr_permissions")
    .where({ section, action })
    .first<{ id: string }>("id");
  if (!permission) {
    throw new Error("Settings permission was not created");
  }
  return permission.id;
}

export async function replaceSettingsPermissions(
  transaction: Knex.Transaction,
  policyId: string,
  permissions: SettingsPermissionInput[],
): Promise<void> {
  const selected: string[] = [];
  for (const permission of permissions) {
    selected.push(
      await ensureSettingsPermission(
        transaction,
        permission.section,
        permission.action,
      ),
    );
  }
  await transaction("public.asmblyr_policy_permissions")
    .where({ policy_id: policyId })
    .whereIn(
      "permission_id",
      transaction("public.asmblyr_permissions")
        .whereNotNull("section")
        .select("id"),
    )
    .whereNotIn("permission_id", selected)
    .delete();
  if (selected.length) {
    await transaction("public.asmblyr_policy_permissions")
      .insert(
        selected.map((id) => ({ policy_id: policyId, permission_id: id })),
      )
      .onConflict()
      .ignore();
  }
}
