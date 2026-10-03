import type { Knex } from "knex";
import { requireSettingsAdministrator } from "../settings/admin-access.js";
import { securityEvent } from "../auth/security-events.js";
import { PolicyNotFoundError } from "./validation.js";
import { UserNotFoundError } from "../auth/validation.js";

export async function delegatedPolicyIds(
  database: Knex,
  userId: string,
): Promise<string[]> {
  return database("asmblyr_user_policy_delegations")
    .withSchema("public")
    .where({ user_id: userId })
    .orderBy("policy_id")
    .pluck<string[]>("policy_id");
}

export async function replaceUserDelegation(
  database: Knex,
  userId: string,
  policyIds: string[],
  authorization?: string,
): Promise<string[]> {
  return database.transaction(async (transaction) => {
    const actor = await requireSettingsAdministrator(transaction, {
      headers: { authorization },
    });
    const target = await transaction("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first("id");
    if (!target) {
      throw new UserNotFoundError();
    }
    const policies = await transaction("public.asmblyr_policies")
      .whereIn("id", policyIds)
      .forShare()
      .select("id");
    if (policies.length !== policyIds.length) {
      throw new PolicyNotFoundError();
    }
    await transaction("public.asmblyr_user_policy_delegations")
      .where({ user_id: userId })
      .delete();
    if (policyIds.length) {
      await transaction("public.asmblyr_user_policy_delegations").insert(
        policyIds.map((policyId) => ({ user_id: userId, policy_id: policyId })),
      );
    }
    await securityEvent(transaction, actor.id, "user.delegation_set", userId, {
      policyIds,
    });
    return delegatedPolicyIds(transaction, userId);
  });
}
