import type { Knex } from "knex";
import type {
  AssistantSkill,
  AssistantSkillAdminListResult,
  AssistantSkillAudience,
  AssistantSkillCollectionRef,
  AssistantSkillInput,
  AssistantSkillPolicyRef,
  AssistantSkillScope,
  AssistantSkillStatus,
} from "@asmblyr-collaborative/contracts";
import { securityEvent } from "../auth/security-events.js";
import { ItemError } from "../items/validation.js";
import { postgresCode } from "../shared/postgres-error.js";
import {
  buildSkillAdminMeta,
  canManageSkillTarget,
  loadSkillManagerScope,
  requireManagedSkillWrite,
  type SkillManagerScope,
  type SkillScopeTarget,
} from "./access.js";
import { MAX_SKILLS } from "./validation.js";

const SKILLS_TABLE = "public.asmblyr_assistant_skills";
const SKILL_COLLECTIONS_TABLE = "public.asmblyr_assistant_skill_collections";
const SKILL_POLICIES_TABLE = "public.asmblyr_assistant_skill_policies";

interface SkillRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  examples: unknown;
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  status: AssistantSkillStatus;
  expose_to_mcp: boolean;
  created_by: string | null;
  created_by_name: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function parseStoredExamples(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function hydrateAdminSkills(
  db: Knex,
  rows: SkillRow[],
  managerScope: SkillManagerScope,
): Promise<AssistantSkill[]> {
  if (rows.length === 0) {
    return [];
  }
  const skillIds = rows.map((row) => row.id);
  const [collectionLinks, policyLinks, activeUsers, userPolicies] =
    await Promise.all([
      db(`${SKILL_COLLECTIONS_TABLE} as link`)
        .join(
          "public.asmblyr_collections as collection",
          "collection.id",
          "link.collection_id",
        )
        .whereIn("link.skill_id", skillIds)
        .select<
          {
            skill_id: string;
            name: string;
            display_name: string | null;
            mcp_enabled: boolean;
          }[]
        >(
          "link.skill_id",
          "collection.name",
          "collection.display_name",
          "collection.mcp_enabled",
        )
        .orderBy("collection.name", "asc"),
      db(`${SKILL_POLICIES_TABLE} as link`)
        .join(
          "public.asmblyr_policies as policy",
          "policy.id",
          "link.policy_id",
        )
        .whereIn("link.skill_id", skillIds)
        .select<
          { skill_id: string; id: string; name: string }[]
        >("link.skill_id", "policy.id", "policy.name")
        .orderBy("policy.name", "asc"),
      db("public.asmblyr_users")
        .where({ status: "active" })
        .select<{ id: string; superuser: boolean }[]>("id", "superuser"),
      db("public.asmblyr_user_policies as assignment")
        .join("public.asmblyr_users as usr", "usr.id", "assignment.user_id")
        .where("usr.status", "active")
        .select<
          { policy_id: string; user_id: string }[]
        >("assignment.policy_id", "assignment.user_id"),
    ]);

  const collectionsBySkill = new Map<string, AssistantSkillCollectionRef[]>();
  for (const link of collectionLinks) {
    const list = collectionsBySkill.get(link.skill_id) ?? [];
    list.push({
      name: link.name,
      displayName: link.display_name ?? link.name,
      mcpEnabled: link.mcp_enabled,
    });
    collectionsBySkill.set(link.skill_id, list);
  }

  const policiesBySkill = new Map<string, AssistantSkillPolicyRef[]>();
  for (const link of policyLinks) {
    const list = policiesBySkill.get(link.skill_id) ?? [];
    list.push({ id: link.id, name: link.name });
    policiesBySkill.set(link.skill_id, list);
  }

  const totalActiveUsers = activeUsers.length;
  const superuserIds = activeUsers
    .filter((user) => user.superuser)
    .map((user) => user.id);
  const usersByPolicy = new Map<string, string[]>();
  for (const assignment of userPolicies) {
    const policyId = assignment.policy_id.toLowerCase();
    const list = usersByPolicy.get(policyId) ?? [];
    list.push(assignment.user_id);
    usersByPolicy.set(policyId, list);
  }

  return rows.map((row) => {
    const collectionDetails = collectionsBySkill.get(row.id) ?? [];
    const collections = collectionDetails.map((item) => item.name);
    const policies = policiesBySkill.get(row.id) ?? [];
    const policyIds = policies.map((item) => item.id);
    const target: SkillScopeTarget = {
      scope: row.scope,
      audience: row.audience,
      collections,
      policyIds,
    };

    let audienceUsersCount: number;
    if (row.audience === "all") {
      audienceUsersCount = totalActiveUsers;
    } else {
      const covered = new Set<string>(superuserIds);
      for (const policyId of policyIds) {
        for (const userId of usersByPolicy.get(policyId.toLowerCase()) ?? []) {
          covered.add(userId);
        }
      }
      audienceUsersCount = covered.size;
    }

    const mcpReady =
      row.status === "active" &&
      row.expose_to_mcp &&
      (row.scope === "global" ||
        (collectionDetails.length > 0 &&
          collectionDetails.every((item) => item.mcpEnabled)));

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      instructions: row.instructions,
      examples: parseStoredExamples(row.examples),
      scope: row.scope,
      audience: row.audience,
      status: row.status,
      exposeToMcp: row.expose_to_mcp,
      collections,
      collectionDetails,
      policyIds,
      policies,
      manageable: canManageSkillTarget(managerScope, target),
      coverage: {
        audienceUsersCount,
        collectionNames: collections,
        mcpReady,
      },
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      updatedBy: row.updated_by,
      updatedByName: row.updated_by_name,
      createdAt: toIsoString(row.created_at),
      updatedAt: toIsoString(row.updated_at),
    };
  });
}

function adminSkillQuery(db: Knex) {
  return db(`${SKILLS_TABLE} as skill`)
    .leftJoin(
      "public.asmblyr_users as creator",
      "creator.id",
      "skill.created_by",
    )
    .leftJoin(
      "public.asmblyr_users as updater",
      "updater.id",
      "skill.updated_by",
    )
    .select<
      SkillRow[]
    >("skill.id", "skill.slug", "skill.title", "skill.description", "skill.instructions", "skill.examples", "skill.scope", "skill.audience", "skill.status", "skill.expose_to_mcp", "skill.created_by", db.raw("coalesce(nullif(btrim(creator.display_name), ''), nullif(btrim(concat_ws(' ', creator.first_name, creator.last_name)), ''), creator.email) as created_by_name"), "skill.updated_by", db.raw("coalesce(nullif(btrim(updater.display_name), ''), nullif(btrim(concat_ws(' ', updater.first_name, updater.last_name)), ''), updater.email) as updated_by_name"), "skill.created_at", "skill.updated_at");
}

export async function listAdminSkills(
  db: Knex,
  actorId: string,
): Promise<AssistantSkillAdminListResult> {
  const [rows, managerScope] = await Promise.all([
    adminSkillQuery(db)
      .orderBy("skill.updated_at", "desc")
      .orderBy("skill.slug", "asc"),
    loadSkillManagerScope(db, actorId, false),
  ]);
  return {
    data: await hydrateAdminSkills(db, rows, managerScope),
    meta: buildSkillAdminMeta(managerScope),
  };
}

async function getAdminSkill(
  db: Knex,
  id: string,
  managerScope: SkillManagerScope,
): Promise<AssistantSkill> {
  const row = await adminSkillQuery(db).where("skill.id", id).first<SkillRow>();
  if (!row) {
    throw new ItemError("Умение не найдено", 404);
  }
  const [hydrated] = await hydrateAdminSkills(db, [row], managerScope);
  return hydrated!;
}

async function loadExistingSkillTarget(
  trx: Knex,
  id: string,
): Promise<SkillScopeTarget> {
  const existing = await trx(SKILLS_TABLE).where({ id }).forUpdate().first<{
    scope: AssistantSkillScope;
    audience: AssistantSkillAudience;
  }>("scope", "audience");
  if (!existing) {
    throw new ItemError("Умение не найдено", 404);
  }
  const [collections, policyIds] = await Promise.all([
    trx(`${SKILL_COLLECTIONS_TABLE} as link`)
      .join(
        "public.asmblyr_collections as collection",
        "collection.id",
        "link.collection_id",
      )
      .where("link.skill_id", id)
      .pluck<string[]>("collection.name"),
    trx(SKILL_POLICIES_TABLE)
      .where({ skill_id: id })
      .pluck<string[]>("policy_id"),
  ]);
  return {
    scope: existing.scope,
    audience: existing.audience,
    collections,
    policyIds,
  };
}

export async function saveSkill(
  db: Knex,
  input: AssistantSkillInput,
  actorId: string,
  id?: string,
): Promise<AssistantSkill> {
  try {
    return await db.transaction(async (trx) => {
      let existingTarget: SkillScopeTarget | null = null;
      if (id) {
        existingTarget = await loadExistingSkillTarget(trx, id);
      } else {
        await trx.raw(
          "SELECT pg_advisory_xact_lock(hashtextextended('asmblyr.assistant_skills', 0))",
        );
      }

      const incomingTarget: SkillScopeTarget = {
        scope: input.scope,
        audience: input.audience,
        collections: input.collections,
        policyIds: input.policyIds,
      };
      const managerScope = await requireManagedSkillWrite(
        trx,
        actorId,
        incomingTarget,
        existingTarget,
      );

      if (!id) {
        const count = await trx(SKILLS_TABLE)
          .count<{ total: string }>("* as total")
          .first();
        if (Number(count?.total ?? 0) >= MAX_SKILLS) {
          throw new ItemError(`Можно создать до ${MAX_SKILLS} умений`, 409);
        }
      }

      const collectionRows = input.collections.length
        ? await trx("public.asmblyr_collections")
            .whereIn("name", input.collections)
            .whereRaw("left(name, 8) <> ?", ["asmblyr_"])
            .forShare()
            .select<{ id: string; name: string }[]>("id", "name")
        : [];
      if (collectionRows.length !== input.collections.length) {
        throw new ItemError("Некоторые выбранные коллекции не найдены", 404);
      }

      const policyRows = input.policyIds.length
        ? await trx("public.asmblyr_policies")
            .whereIn("id", input.policyIds)
            .forShare()
            .select<{ id: string }[]>("id")
        : [];
      if (policyRows.length !== input.policyIds.length) {
        throw new ItemError(
          "Некоторые выбранные политики доступа не найдены",
          404,
        );
      }

      const values = {
        slug: input.slug,
        title: input.title,
        description: input.description,
        instructions: input.instructions,
        examples: JSON.stringify(input.examples),
        scope: input.scope,
        audience: input.audience,
        status: input.status,
        expose_to_mcp: input.exposeToMcp,
        updated_by: actorId,
        updated_at: trx.fn.now(),
      };

      const [saved] = id
        ? await trx(SKILLS_TABLE)
            .where({ id })
            .update(values)
            .returning<{ id: string }[]>("id")
        : await trx(SKILLS_TABLE)
            .insert({ ...values, created_by: actorId })
            .returning<{ id: string }[]>("id");

      const skillId = saved!.id;
      await trx(SKILL_COLLECTIONS_TABLE).where({ skill_id: skillId }).delete();
      if (collectionRows.length > 0) {
        await trx(SKILL_COLLECTIONS_TABLE).insert(
          collectionRows.map((collection) => ({
            skill_id: skillId,
            collection_id: collection.id,
          })),
        );
      }

      await trx(SKILL_POLICIES_TABLE).where({ skill_id: skillId }).delete();
      if (policyRows.length > 0) {
        await trx(SKILL_POLICIES_TABLE).insert(
          policyRows.map((policy) => ({
            skill_id: skillId,
            policy_id: policy.id,
          })),
        );
      }

      await securityEvent(
        trx,
        actorId,
        id ? "skill.updated" : "skill.created",
        skillId,
        {
          slug: input.slug,
          scope: input.scope,
          audience: input.audience,
          status: input.status,
          exposeToMcp: input.exposeToMcp,
        },
      );

      return getAdminSkill(trx, skillId, managerScope);
    });
  } catch (error) {
    if (postgresCode(error) === "23505") {
      throw new ItemError(
        "Умение с таким slug уже существует",
        409,
        "skill_slug_conflict",
      );
    }
    throw error;
  }
}

export async function deleteSkill(
  db: Knex,
  id: string,
  actorId: string,
): Promise<void> {
  await db.transaction(async (trx) => {
    const existingTarget = await loadExistingSkillTarget(trx, id);
    await requireManagedSkillWrite(trx, actorId, null, existingTarget);
    await trx(SKILLS_TABLE).where({ id }).delete();
    await securityEvent(trx, actorId, "skill.deleted", id, {});
  });
}
