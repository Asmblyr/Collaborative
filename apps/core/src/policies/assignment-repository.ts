import type { Knex } from "knex";
import { AccessDeniedError } from "../permissions/access.js";
import { requireDelegatedPolicies } from "./delegation-access.js";
import { PolicyNotFoundError } from "./validation.js";
import { securityEvent } from "../auth/security-events.js";

async function authorizeChanges(
  transaction: Knex,
  actorId: string,
  policyId: string,
  changedIds: string[],
): Promise<void> {
  const actor = await requireDelegatedPolicies(
    transaction,
    actorId,
    "policies",
    [policyId],
  );
  const users = await transaction("public.asmblyr_users")
    .whereIn("id", changedIds)
    .forShare()
    .select<{ id: string; superuser: boolean }[]>("id", "superuser");
  if (users.length !== changedIds.length) {
    throw new PolicyNotFoundError();
  }
  if (
    !actor.superuser &&
    users.some((user) => user.superuser || user.id === actorId)
  ) {
    throw new AccessDeniedError();
  }
}

async function lockPolicy(transaction: Knex, policyId: string): Promise<void> {
  const policy = await transaction("public.asmblyr_policies")
    .where({ id: policyId })
    .forUpdate()
    .first("id");
  if (!policy) {
    throw new PolicyNotFoundError();
  }
}

export async function setPolicyUser(
  database: Knex,
  policyId: string,
  userId: string,
  actorId: string,
  assigned: boolean,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await authorizeChanges(transaction, actorId, policyId, [userId]);
    await lockPolicy(transaction, policyId);
    const assignment = transaction("public.asmblyr_user_policies").where({
      policy_id: policyId,
      user_id: userId,
    });
    if (assigned) {
      await transaction("public.asmblyr_user_policies")
        .insert({ policy_id: policyId, user_id: userId })
        .onConflict()
        .ignore();
    } else if (!(await assignment.delete())) {
      throw new PolicyNotFoundError();
    }
    await securityEvent(
      transaction,
      actorId,
      assigned ? "policy.user_assigned" : "policy.user_removed",
      policyId,
      { userId },
    );
  });
}

export async function replacePolicyUsers(
  database: Knex,
  policyId: string,
  userIds: string[],
  actorId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await requireDelegatedPolicies(transaction, actorId, "policies", [
      policyId,
    ]);
    await lockPolicy(transaction, policyId);
    const previous = await transaction("public.asmblyr_user_policies")
      .where({ policy_id: policyId })
      .pluck<string[]>("user_id");
    const changed = [...new Set([...previous, ...userIds])].filter(
      (id) => previous.includes(id) !== userIds.includes(id),
    );
    await authorizeChanges(transaction, actorId, policyId, changed);
    const existing = await transaction("public.asmblyr_users")
      .whereIn("id", userIds)
      .select("id");
    if (existing.length !== userIds.length) {
      throw new PolicyNotFoundError();
    }
    await transaction("public.asmblyr_user_policies")
      .where({ policy_id: policyId })
      .whereNotIn("user_id", userIds)
      .delete();
    if (userIds.length) {
      await transaction("public.asmblyr_user_policies")
        .insert(
          userIds.map((userId) => ({ policy_id: policyId, user_id: userId })),
        )
        .onConflict()
        .ignore();
    }
    await securityEvent(transaction, actorId, "policy.users_set", policyId, {
      userIds,
    });
  });
}
