import type { Knex } from "knex";
import { AccessDeniedError } from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";
import { requireDelegatedPolicies } from "./delegation-access.js";
import { PolicyNotFoundError } from "./validation.js";
import { securityEvent } from "../auth/security-events.js";
import { UserNotFoundError } from "../auth/validation.js";

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

export async function replaceUserPolicies(
  database: Knex,
  userId: string,
  requestedPolicyIds: string[],
  actorId: string,
): Promise<string[]> {
  return database.transaction(async (transaction) => {
    const actor = await transaction("public.asmblyr_users")
      .where({ id: actorId, status: "active" })
      .forShare()
      .first<{ superuser: boolean }>("superuser");
    if (!actor) {
      throw new AccessDeniedError();
    }
    const target = await transaction("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first<{ id: string; superuser: boolean }>("id", "superuser");
    if (!target) {
      throw new UserNotFoundError();
    }

    let nextPolicyIds: string[];
    if (actor.superuser) {
      nextPolicyIds = [...new Set(requestedPolicyIds)];
    } else {
      const access = await effectiveSettingsAccess(transaction, actorId);
      if (
        !access.editableSections.includes("policies") ||
        !access.sections.includes("users") ||
        target.superuser ||
        target.id === actorId
      ) {
        throw new AccessDeniedError();
      }
      const allowed = await transaction(
        "public.asmblyr_user_policy_delegations",
      )
        .where({ user_id: actorId })
        .forShare()
        .pluck<string[]>("policy_id");
      const allowedSet = new Set(allowed);
      const current = await transaction("public.asmblyr_user_policies")
        .where({ user_id: userId })
        .pluck<string[]>("policy_id");
      const currentSet = new Set(current);

      // Reject adding any policy outside the manager's delegation set.
      if (
        requestedPolicyIds.some(
          (id) => !allowedSet.has(id) && !currentSet.has(id),
        )
      ) {
        throw new AccessDeniedError();
      }

      // Automatically preserve any out-of-scope policies the target already holds.
      const preservedOutOfScope = current.filter((id) => !allowedSet.has(id));
      const desiredInScope = requestedPolicyIds.filter((id) =>
        allowedSet.has(id),
      );
      nextPolicyIds = [...new Set([...preservedOutOfScope, ...desiredInScope])];
    }

    if (nextPolicyIds.length) {
      const existingPolicies = await transaction("public.asmblyr_policies")
        .whereIn("id", nextPolicyIds)
        .forShare()
        .pluck<string[]>("id");
      if (existingPolicies.length !== nextPolicyIds.length) {
        throw new PolicyNotFoundError();
      }
    }

    if (nextPolicyIds.length) {
      await transaction("public.asmblyr_user_policies")
        .where({ user_id: userId })
        .whereNotIn("policy_id", nextPolicyIds)
        .delete();
      await transaction("public.asmblyr_user_policies")
        .insert(
          nextPolicyIds.map((policyId) => ({
            policy_id: policyId,
            user_id: userId,
          })),
        )
        .onConflict()
        .ignore();
    } else {
      await transaction("public.asmblyr_user_policies")
        .where({ user_id: userId })
        .delete();
    }

    await securityEvent(transaction, actorId, "user.policies_set", userId, {
      policyIds: nextPolicyIds,
    });
    return nextPolicyIds;
  });
}
