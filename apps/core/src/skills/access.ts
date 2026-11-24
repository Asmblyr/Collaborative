import type { Knex } from "knex";
import type {
  AssistantSkillAdminMeta,
  AssistantSkillAudience,
  AssistantSkillScope,
} from "@asmblyr-collaborative/contracts";
import { AccessDeniedError } from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";

export interface SkillManagerScope {
  superuser: boolean;
  canEditSkills: boolean;
  delegatablePolicyIds: ReadonlySet<string>;
  readableCollections: ReadonlySet<string>;
}

export interface SkillScopeTarget {
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  collections: readonly string[];
  policyIds: readonly string[];
}

export function canManageSkillTarget(
  manager: SkillManagerScope,
  target: SkillScopeTarget,
): boolean {
  if (!manager.canEditSkills) {
    return false;
  }
  if (manager.superuser) {
    return true;
  }
  if (manager.delegatablePolicyIds.size === 0) {
    return false;
  }
  if (target.audience !== "policies" || target.scope !== "collections") {
    return false;
  }
  if (target.policyIds.length === 0 || target.collections.length === 0) {
    return false;
  }
  if (
    target.policyIds.some(
      (policyId) => !manager.delegatablePolicyIds.has(policyId.toLowerCase()),
    )
  ) {
    return false;
  }
  if (
    target.collections.some(
      (name) =>
        name.startsWith("asmblyr_") || !manager.readableCollections.has(name),
    )
  ) {
    return false;
  }
  return true;
}

export function assertManageableSkillTarget(
  manager: SkillManagerScope,
  target: SkillScopeTarget,
): void {
  if (!canManageSkillTarget(manager, target)) {
    throw new AccessDeniedError();
  }
}

export function buildSkillAdminMeta(
  scope: SkillManagerScope,
): AssistantSkillAdminMeta {
  return {
    superuser: scope.superuser,
    canCreate: scope.superuser
      ? true
      : scope.canEditSkills &&
        scope.delegatablePolicyIds.size > 0 &&
        scope.readableCollections.size > 0,
    canUseGlobalScope: scope.superuser,
    canUseAllAudience: scope.superuser,
    delegatablePolicyIds: [...scope.delegatablePolicyIds],
  };
}

export async function loadSkillManagerScope(
  database: Knex,
  actorId: string,
  lockForShare = false,
): Promise<SkillManagerScope> {
  const actorQuery = database("public.asmblyr_users")
    .where({ id: actorId, status: "active" })
    .select("superuser");
  if (lockForShare) {
    actorQuery.forShare();
  }
  const actor = await actorQuery.first<{ superuser: boolean }>();
  if (!actor) {
    throw new AccessDeniedError();
  }
  if (actor.superuser) {
    return {
      superuser: true,
      canEditSkills: true,
      delegatablePolicyIds: new Set(),
      readableCollections: new Set(),
    };
  }
  const settings = await effectiveSettingsAccess(database, actorId);
  const delegationQuery = database("public.asmblyr_user_policy_delegations")
    .where({ user_id: actorId })
    .select("policy_id");
  if (lockForShare) {
    delegationQuery.forShare();
  }
  const delegationRows = await delegationQuery;
  const delegatablePolicyIds = new Set(
    delegationRows.map((row: { policy_id: string }) =>
      row.policy_id.toLowerCase(),
    ),
  );

  const userPolicyQuery = database("public.asmblyr_user_policies")
    .where({ user_id: actorId })
    .select("policy_id");
  if (lockForShare) {
    userPolicyQuery.forShare();
  }
  const userPolicyRows = await userPolicyQuery;
  const userPolicyIds = userPolicyRows.map(
    (row: { policy_id: string }) => row.policy_id,
  );

  const readableCollections = new Set<string>();
  if (userPolicyIds.length > 0) {
    const collectionRows = await database(
      "public.asmblyr_policy_permissions as link",
    )
      .join(
        "public.asmblyr_permissions as permission",
        "permission.id",
        "link.permission_id",
      )
      .join(
        "public.asmblyr_collections as collection",
        "collection.id",
        "permission.collection_id",
      )
      .whereIn("link.policy_id", userPolicyIds)
      .where("permission.action", "read")
      .whereNotNull("permission.collection_id")
      .whereRaw("left(collection.name, 8) <> ?", ["asmblyr_"])
      .distinct<{ name: string }[]>("collection.name");
    for (const row of collectionRows) {
      readableCollections.add(row.name);
    }
  }

  return {
    superuser: false,
    canEditSkills: settings.editableSections.includes("skills"),
    delegatablePolicyIds,
    readableCollections,
  };
}

export async function requireManagedSkillWrite(
  transaction: Knex,
  actorId: string,
  incoming: SkillScopeTarget | null,
  existing: SkillScopeTarget | null,
): Promise<SkillManagerScope> {
  const scope = await loadSkillManagerScope(transaction, actorId, true);
  if (existing) {
    assertManageableSkillTarget(scope, existing);
  }
  if (incoming) {
    assertManageableSkillTarget(scope, incoming);
  }
  return scope;
}
