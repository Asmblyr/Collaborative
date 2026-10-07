import { listPermissions } from "../permissions/repository.js";
import type { Knex } from "knex";
import { PolicyConflictError, PolicyNotFoundError } from "./validation.js";
import { policyApplicationGrants } from "../oauth/policy-access.js";

function translateConflict(error: unknown): never {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    throw new PolicyConflictError();
  }
  throw error;
}

export async function listPolicies(database: Knex) {
  return database("asmblyr_policies")
    .withSchema("public")
    .select("id", "name", "created_at")
    .orderBy("name");
}

export async function getPolicy(database: Knex, id: string) {
  const policy = await database("asmblyr_policies")
    .withSchema("public")
    .where({ id })
    .first("id", "name", "created_at");
  if (!policy) {
    throw new PolicyNotFoundError();
  }
  const permissions = (await listPermissions(database, id)).map(
    (permission) => {
      const { id, action, fields } = permission;
      return "section" in permission
        ? { id, action, fields, section: permission.section }
        : {
            id,
            action,
            fields,
            collection: permission.collection,
            ...(permission.rowFilter
              ? { rowFilter: permission.rowFilter }
              : {}),
          };
    },
  );
  const users = await database("asmblyr_user_policies as assignment")
    .withSchema("public")
    .join("asmblyr_users as usr", "usr.id", "assignment.user_id")
    .where("assignment.policy_id", id)
    .select("usr.id", "usr.email")
    .orderBy("usr.email");
  return {
    ...policy,
    permissions,
    users,
    applications: await policyApplicationGrants(database, id),
  };
}

export async function createPolicy(database: Knex, name: string) {
  try {
    const [policy] = await database("asmblyr_policies")
      .withSchema("public")
      .insert({ name })
      .returning(["id", "name", "created_at"]);
    return policy;
  } catch (error) {
    return translateConflict(error);
  }
}

export async function renamePolicy(database: Knex, id: string, name: string) {
  try {
    const [policy] = await database("asmblyr_policies")
      .withSchema("public")
      .where({ id })
      .update({ name })
      .returning(["id", "name", "created_at"]);
    if (!policy) {
      throw new PolicyNotFoundError();
    }
    return policy;
  } catch (error) {
    return translateConflict(error);
  }
}

export async function deletePolicy(database: Knex, id: string): Promise<void> {
  const count = await database("asmblyr_policies")
    .withSchema("public")
    .where({ id })
    .delete();
  if (!count) {
    throw new PolicyNotFoundError();
  }
}

export async function attachPermission(
  database: Knex,
  policyId: string,
  permissionId: string,
): Promise<void> {
  const [policy, permission] = await Promise.all([
    database("asmblyr_policies")
      .withSchema("public")
      .where({ id: policyId })
      .first("id"),
    database("asmblyr_permissions")
      .withSchema("public")
      .where({ id: permissionId })
      .first("id"),
  ]);
  if (!policy || !permission) {
    throw new PolicyNotFoundError();
  }
  try {
    await database("asmblyr_policy_permissions")
      .withSchema("public")
      .insert({ policy_id: policyId, permission_id: permissionId })
      .onConflict()
      .ignore();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23503"
    ) {
      throw new PolicyNotFoundError();
    }
    throw error;
  }
}

export async function detachPermission(
  database: Knex,
  policyId: string,
  permissionId: string,
): Promise<void> {
  const count = await database("asmblyr_policy_permissions")
    .withSchema("public")
    .where({ policy_id: policyId, permission_id: permissionId })
    .delete();
  if (!count) {
    throw new PolicyNotFoundError();
  }
}

export async function assignPolicy(
  database: Knex,
  policyId: string,
  userId: string,
): Promise<void> {
  const policy = await database("asmblyr_policies")
    .withSchema("public")
    .where({ id: policyId })
    .first("id");
  const user = await database("asmblyr_users")
    .withSchema("public")
    .where({ id: userId })
    .first("id");
  if (!policy || !user) {
    throw new PolicyNotFoundError();
  }
  await database("asmblyr_user_policies")
    .withSchema("public")
    .insert({ policy_id: policyId, user_id: userId })
    .onConflict()
    .ignore();
}

export async function unassignPolicy(
  database: Knex,
  policyId: string,
  userId: string,
): Promise<void> {
  const count = await database("asmblyr_user_policies")
    .withSchema("public")
    .where({ policy_id: policyId, user_id: userId })
    .delete();
  if (!count) {
    throw new PolicyNotFoundError();
  }
}
