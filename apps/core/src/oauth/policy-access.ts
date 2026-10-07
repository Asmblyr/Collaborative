import type { Knex } from "knex";

export interface ApplicationGrant {
  appId: string;
  scopes: string[];
}

export async function policyApplicationCatalog(db: Knex) {
  return db("public.asmblyr_oauth_apps")
    .where({ policy_managed: true })
    .orderBy("name")
    .select(
      "id",
      "name",
      "enabled",
      "audience",
      "scopes",
      "scope_labels as scopeLabels",
    );
}

export async function policyApplicationGrants(
  db: Knex,
  policyId: string,
): Promise<ApplicationGrant[]> {
  return db("public.asmblyr_policy_oauth_apps")
    .where({ policy_id: policyId })
    .orderBy("app_id")
    .select("app_id as appId", "scopes");
}

export async function effectiveApplicationGrant(
  db: Knex,
  appId: string,
  userId: string,
) {
  const grants = await db("public.asmblyr_policy_oauth_apps as grant")
    .join(
      "public.asmblyr_user_policies as assignment",
      "assignment.policy_id",
      "grant.policy_id",
    )
    .where({ "grant.app_id": appId, "assignment.user_id": userId })
    .select<{ scopes: string[] }[]>("grant.scopes");
  return {
    allowed: grants.length > 0,
    scopes: [...new Set(grants.flatMap((grant) => grant.scopes))].sort(),
  };
}

export async function replacePolicyApplications(
  db: Knex.Transaction,
  policyId: string,
  grants: ApplicationGrant[],
) {
  const previous = await policyApplicationGrants(db, policyId);
  const apps = await db("public.asmblyr_oauth_apps")
    .whereIn("id", grants.map((grant) => grant.appId).sort())
    .orderBy("id")
    .forShare()
    .select<{ id: string; policy_managed: boolean; scopes: string[] }[]>(
      "id",
      "policy_managed",
      "scopes",
    );
  for (const grant of grants) {
    const app = apps.find((app) => app.id === grant.appId);
    const unchangedInactive =
      app &&
      !app.policy_managed &&
      previous.some(
        (entry) =>
          entry.appId === app.id &&
          JSON.stringify([...entry.scopes].sort()) ===
            JSON.stringify([...grant.scopes].sort()),
      );
    if (
      !app ||
      (!app.policy_managed && !unchangedInactive) ||
      grant.scopes.some((scope) => !app.scopes.includes(scope))
    ) {
      throw Object.assign(
        new Error("Unknown application or application permission"),
        { statusCode: 400 },
      );
    }
  }
  await db("public.asmblyr_policy_oauth_apps")
    .where({ policy_id: policyId })
    .delete();
  if (grants.length) {
    await db("public.asmblyr_policy_oauth_apps").insert(
      grants.map((grant) => ({
        policy_id: policyId,
        app_id: grant.appId,
        scopes: JSON.stringify(grant.scopes),
      })),
    );
  }
}
