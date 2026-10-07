import type { Knex } from "knex";
import { PermissionNotFoundError } from "../permissions/validation.js";
import { replaceSettingsPermissions } from "../permissions/settings-permissions.js";
import { writePermissions } from "./configuration-permissions.js";
import type { PolicyConfigurationInput } from "./configuration-validation.js";
import { PolicyConflictError, PolicyNotFoundError } from "./validation.js";
import { replacePolicyApplications } from "../oauth/policy-access.js";

async function writeUsers(
  transaction: Knex.Transaction,
  policyId: string,
  userIds: string[],
): Promise<void> {
  const existingUsers =
    userIds.length === 0
      ? []
      : await transaction("asmblyr_users")
          .withSchema("public")
          .whereIn("id", userIds)
          .forShare()
          .pluck<string[]>("id");
  if (existingUsers.length !== userIds.length) {
    throw new PolicyNotFoundError();
  }
  const assignment = transaction("asmblyr_user_policies")
    .withSchema("public")
    .where({ policy_id: policyId });
  if (userIds.length === 0) {
    await assignment.delete();
  } else {
    await assignment.whereNotIn("user_id", userIds).delete();
  }
  if (userIds.length > 0) {
    await transaction("asmblyr_user_policies")
      .withSchema("public")
      .insert(
        userIds.map((userId) => ({ policy_id: policyId, user_id: userId })),
      )
      .onConflict()
      .ignore();
  }
}

function translateError(error: unknown): never {
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "23505") {
      throw new PolicyConflictError();
    }
    if (error.code === "23503" || error.code === "42P01") {
      throw new PermissionNotFoundError();
    }
  }
  throw error;
}

export async function createPolicyConfiguration(
  database: Knex,
  input: PolicyConfigurationInput,
) {
  try {
    return await database.transaction(async (transaction) => {
      const [policy] = await transaction("asmblyr_policies")
        .withSchema("public")
        .insert({ name: input.name })
        .returning(["id", "name", "created_at"]);
      await writePermissions(transaction, policy.id, {
        permissions: input.permissions.filter((entry) => "collection" in entry),
      });
      await replaceSettingsPermissions(
        transaction,
        policy.id,
        input.permissions.filter((entry) => "section" in entry),
      );
      await writeUsers(transaction, policy.id, input.userIds);
      await replacePolicyApplications(
        transaction,
        policy.id,
        input.applications ?? [],
      );
      return policy;
    });
  } catch (error) {
    return translateError(error);
  }
}

export async function updatePolicyConfiguration(
  database: Knex,
  id: string,
  input: PolicyConfigurationInput,
) {
  try {
    return await database.transaction(async (transaction) => {
      const policy = await transaction("asmblyr_policies")
        .withSchema("public")
        .where({ id })
        .forUpdate()
        .first("id");
      if (!policy) {
        throw new PolicyNotFoundError();
      }
      await writePermissions(transaction, id, {
        permissions: input.permissions.filter((entry) => "collection" in entry),
      });
      await replaceSettingsPermissions(
        transaction,
        id,
        input.permissions.filter((entry) => "section" in entry),
      );
      await writeUsers(transaction, id, input.userIds);
      if (input.applications !== undefined) {
        await replacePolicyApplications(transaction, id, input.applications);
      }
      const [updated] = await transaction("asmblyr_policies")
        .withSchema("public")
        .where({ id })
        .update({ name: input.name })
        .returning(["id", "name", "created_at"]);
      return updated;
    });
  } catch (error) {
    return translateError(error);
  }
}
