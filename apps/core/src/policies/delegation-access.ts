import type { Knex } from "knex";
import type { SettingsSection } from "@asmblyr/contracts";
import { AccessDeniedError } from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";

export async function requireDelegatedPolicies(
  transaction: Knex,
  actorId: string,
  section: SettingsSection,
  policyIds: string[],
): Promise<{ superuser: boolean }> {
  const actor = await transaction("public.asmblyr_users")
    .where({ id: actorId, status: "active" })
    .forShare()
    .first<{ superuser: boolean }>("superuser");
  if (!actor) {
    throw new AccessDeniedError();
  }
  if (actor.superuser) {
    return actor;
  }
  const access = await effectiveSettingsAccess(transaction, actorId);
  const allowed = await transaction("public.asmblyr_user_policy_delegations")
    .where({ user_id: actorId })
    .forShare()
    .pluck<string[]>("policy_id");
  if (
    !access.editableSections.includes(section) ||
    policyIds.some((id) => !allowed.includes(id))
  ) {
    throw new AccessDeniedError();
  }
  return actor;
}

export async function requireManagedService(
  transaction: Knex,
  actorId: string,
  serviceId: string,
): Promise<void> {
  const policies = await transaction("public.asmblyr_service_policies")
    .where({ service_id: serviceId })
    .pluck<string[]>("policy_id");
  await requireDelegatedPolicies(transaction, actorId, "services", policies);
}

export async function requireManagedInvitation(
  transaction: Knex,
  actorId: string,
  userId: string,
): Promise<void> {
  const policies = await transaction("public.asmblyr_user_policies")
    .where({ user_id: userId })
    .pluck<string[]>("policy_id");
  const actor = await requireDelegatedPolicies(
    transaction,
    actorId,
    "users",
    policies,
  );
  if (actor.superuser) {
    return;
  }
  const targetDelegations = await transaction(
    "public.asmblyr_user_policy_delegations",
  )
    .where({ user_id: userId })
    .pluck<string[]>("policy_id");
  if (actorId === userId || targetDelegations.length) {
    throw new AccessDeniedError();
  }
}
