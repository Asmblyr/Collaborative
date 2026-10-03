import { settingsSections } from "@asmblyr/contracts";
import { effectiveSettingsAccess } from "../settings/access.js";
import type { Knex } from "knex";
import { effectivePermissions } from "../permissions/repository.js";
import { UserNotFoundError } from "./validation.js";

export async function getUserAccess(database: Knex, userId: string) {
  const user = await database("asmblyr_users as usr")
    .withSchema("public")
    .leftJoin(
      "asmblyr_password_credentials as credential",
      "credential.user_id",
      "usr.id",
    )
    .where("usr.id", userId)
    .first<{
      id: string;
      email: string;
      status: string;
      superuser: boolean;
      hasPassword: boolean;
    }>(
      "usr.id",
      "usr.email",
      "usr.status",
      "usr.superuser",
      database.raw("credential.user_id IS NOT NULL AS ??", ["hasPassword"]),
    );
  if (!user) {
    throw new UserNotFoundError();
  }

  const [policies, permissions] = await Promise.all([
    database("asmblyr_user_policies as assignment")
      .withSchema("public")
      .join("asmblyr_policies as policy", "policy.id", "assignment.policy_id")
      .where("assignment.user_id", userId)
      .select<{ id: string; name: string }[]>("policy.id", "policy.name")
      .orderBy("policy.name"),
    user.superuser
      ? Promise.resolve([])
      : effectivePermissions(database, userId),
  ]);
  const settings = user.superuser
    ? {
        sections: [...settingsSections],
        editableSections: [...settingsSections],
        canManagePolicies: true,
        delegatablePolicyIds: [],
      }
    : await effectiveSettingsAccess(database, userId);
  return { user, policies, permissions, ...settings };
}
