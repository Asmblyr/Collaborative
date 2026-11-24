import "./support/require-test-database.js";
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import knex from "knex";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { loadAccess } from "../src/permissions/access.js";
import {
  describeCollectionSkills,
  listVisibleSkills,
  readVisibleSkill,
} from "../src/skills/visibility.js";

test("assistant skills CRUD, delegation boundaries, 2-layer visibility, MCP gating, and related terms RBAC", async (t) => {
  const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
  const app = createApp({
    databaseUrl: process.env.DATABASE_URL,
    logger: false,
  });

  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const colA = `skill_a_${suffix}`;
  const colB = `skill_b_${suffix}`;
  const userIds: string[] = [];
  const policyIds: string[] = [];
  const skillIds: string[] = [];
  const termIds: string[] = [];
  let workspaceId: string | null = null;

  t.after(async () => {
    if (skillIds.length) {
      await db("public.asmblyr_assistant_skills")
        .whereIn("id", skillIds)
        .delete();
    }
    if (workspaceId) {
      await db("public.asmblyr_workspaces").where({ id: workspaceId }).delete();
    }
    if (termIds.length) {
      await db("public.asmblyr_collection_terms")
        .whereIn("term_id", termIds)
        .delete();
      await db("public.asmblyr_terms").whereIn("id", termIds).delete();
    }
    await db("public.asmblyr_policies").whereIn("id", policyIds).delete();
    await db("public.asmblyr_security_events")
      .whereIn("actor_id", userIds)
      .delete();
    await db("public.asmblyr_users").whereIn("id", userIds).delete();
    for (const col of [colA, colB]) {
      await db.schema.dropTableIfExists(col);
      await db("public.asmblyr_collections").where({ name: col }).delete();
    }
    await app.close();
    await db.destroy();
  });

  // Create 4 test users: superuser, delegatedManager, emptyDelegationManager, endUser
  const insertedUsers = await db("public.asmblyr_users")
    .insert([
      {
        email: `admin_${suffix}@example.test`,
        display_name: "Супер Админ",
        superuser: true,
      },
      {
        email: `mgr_${suffix}@example.test`,
        display_name: "Менеджер Навыков",
        superuser: false,
      },
      {
        email: `empty_${suffix}@example.test`,
        display_name: "Без Делегаций",
        superuser: false,
      },
      {
        email: `user_${suffix}@example.test`,
        display_name: "Сотрудник",
        superuser: false,
      },
    ])
    .returning<{ id: string }[]>("id");
  userIds.push(...insertedUsers.map((u) => u.id));
  const [, managerId, emptyManagerId, endUserId] = userIds;

  const tokens = await Promise.all(
    userIds.map(async (id) => ({
      authorization: `Bearer ${(await issueUserTokens(db, id)).accessToken}`,
    })),
  );
  const [adminHdr, managerHdr, emptyManagerHdr, endUserHdr] = tokens;

  const call = (
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    headers = adminHdr,
    payload?: object,
  ) => app.inject({ method, url, headers, ...(payload ? { payload } : {}) });

  // Create two test collections colA (with public + secret fields) and colB
  for (const name of [colA, colB]) {
    const res = await call("POST", "/collections", adminHdr, {
      name,
      displayName: `Коллекция ${name}`,
      mcp: { enabled: true },
      fields: [
        { name: "title", type: "text", nullable: false },
        { name: "secret_margin", type: "integer", nullable: true },
      ],
    });
    assert.equal(res.statusCode, 201, res.body);
  }
  const colARow = await db("public.asmblyr_collections")
    .where({ name: colA })
    .first<{ id: string }>("id");
  assert.ok(colARow);

  // Create workspace containing colA only
  const wsRes = await call("POST", "/workspaces", adminHdr, {
    name: `WS ${suffix}`,
    description: "Skill test workspace",
    collections: [colA],
  });
  assert.equal(wsRes.statusCode, 201, wsRes.body);
  workspaceId = wsRes.json().data.id;

  // Create policies:
  // 1. delegatedPolicy: read colA (title only — hides secret_margin!), assigned to endUser
  // 2. protectedPolicy: read colA & colB
  // 3. managerPolicy: skills update + read colA (assigned to manager and emptyManager)
  const createPolicy = async (permissions: object[], members: string[]) => {
    const res = await call("POST", "/policies", adminHdr, {
      name: `pol_${randomUUID().slice(0, 8)}`,
      permissions,
      userIds: members,
    });
    assert.equal(res.statusCode, 201, res.body);
    const id = res.json().data.id as string;
    policyIds.push(id);
    return id;
  };

  const delegatedPolicy = await createPolicy(
    [{ collection: colA, action: "read", fields: ["title"] }],
    [endUserId],
  );
  const protectedPolicy = await createPolicy(
    [
      { collection: colA, action: "read", fields: ["*"] },
      { collection: colB, action: "read", fields: ["*"] },
    ],
    [],
  );
  await createPolicy(
    [
      { section: "skills", action: "update", fields: ["*"] },
      { collection: colA, action: "read", fields: ["*"] },
    ],
    [managerId, emptyManagerId],
  );

  // Grant delegation of delegatedPolicy to managerId only (emptyManagerId has 0 delegations)
  const delRes = await call("PUT", `/users/${managerId}/delegation`, adminHdr, {
    policyIds: [delegatedPolicy],
  });
  assert.equal(delRes.statusCode, 200, delRes.body);

  // Verify /settings/options/policies works with skills permission & supports ?delegatable=1
  const allPoliciesOpt = await call(
    "GET",
    "/settings/options/policies",
    managerHdr,
  );
  assert.equal(allPoliciesOpt.statusCode, 200, allPoliciesOpt.body);
  assert.deepEqual(allPoliciesOpt.json().delegatablePolicyIds, [
    delegatedPolicy,
  ]);
  const filteredPoliciesOpt = await call(
    "GET",
    "/settings/options/policies?delegatable=1",
    managerHdr,
  );
  assert.equal(filteredPoliciesOpt.statusCode, 200, filteredPoliciesOpt.body);
  assert.deepEqual(
    filteredPoliciesOpt.json().data.map((p: { id: string }) => p.id),
    [delegatedPolicy],
  );

  // Bind 2 glossary terms on colA: one on readable field "title", one on hidden field "secret_margin"
  for (const [termName, filter] of [
    [
      `Открытый_${suffix}`,
      { logic: "and", children: [{ field: "title", op: "notEmpty" }] },
    ],
    [
      `СкрытаяМаржа_${suffix}`,
      {
        logic: "and",
        children: [{ field: "secret_margin", op: "gt", value: "10" }],
      },
    ],
  ] as const) {
    const termRes = await call("POST", "/settings/terms", adminHdr, {
      name: termName,
      description: `Термин ${termName}`,
      aliases: [],
      enabled: true,
    });
    assert.equal(termRes.statusCode, 201, termRes.body);
    const termId = termRes.json().data.id as string;
    termIds.push(termId);
    const bindRes = await call(
      "PUT",
      `/collections/${colA}/terms/${termId}`,
      adminHdr,
      { filter },
    );
    assert.equal(bindRes.statusCode, 204, bindRes.body);
  }

  // Superuser creates:
  // 1) global active skill with exposeToMcp=false
  const globalSlug = `global_${suffix}`;
  const createGlobal = await call("POST", "/settings/skills", adminHdr, {
    slug: globalSlug,
    title: "Общий отчёт",
    description: "Сводка по всем доступным данным",
    instructions: "Собери краткую сводку.",
    examples: ["Сделай общий отчёт"],
    scope: "global",
    audience: "all",
    status: "active",
    exposeToMcp: false,
    collections: [],
    policyIds: [],
  });
  assert.equal(createGlobal.statusCode, 201, createGlobal.body);
  const globalSkillId = createGlobal.json().data.id as string;
  skillIds.push(globalSkillId);
  assert.equal(createGlobal.json().data.createdByName, "Супер Админ");

  // Duplicate slug returns 409
  const dup = await call("POST", "/settings/skills", adminHdr, {
    slug: globalSlug,
    title: "Дубль",
    description: "Дубль",
    instructions: "Дубль",
    examples: [],
    scope: "global",
    audience: "all",
    status: "draft",
    exposeToMcp: false,
    collections: [],
    policyIds: [],
  });
  assert.equal(dup.statusCode, 409, dup.body);

  // Delegated manager checks GET /settings/skills: sees global skill with manageable=false
  const mgrList = await call("GET", "/settings/skills", managerHdr);
  assert.equal(mgrList.statusCode, 200, mgrList.body);
  assert.equal(mgrList.json().meta.canCreate, true);
  assert.equal(mgrList.json().meta.canUseGlobalScope, false);
  assert.equal(mgrList.json().meta.canUseAllAudience, false);
  const globalEntry = mgrList
    .json()
    .data.find((s: { id: string }) => s.id === globalSkillId);
  assert.equal(globalEntry.manageable, false);

  // Delegated manager CANNOT edit/delete superuser's global/all skill
  assert.equal(
    (
      await call("PUT", `/settings/skills/${globalSkillId}`, managerHdr, {
        slug: globalSlug,
        title: "Hack",
        description: "Hack",
        instructions: "Hack",
        examples: [],
        scope: "collections",
        audience: "policies",
        status: "active",
        exposeToMcp: false,
        collections: [colA],
        policyIds: [delegatedPolicy],
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await call("DELETE", `/settings/skills/${globalSkillId}`, managerHdr))
      .statusCode,
    403,
  );

  // Delegated manager CANNOT create with audience='all', scope='global', protectedPolicy, or unreadable colB
  for (const badPayload of [
    {
      slug: `bad_all_${suffix}`,
      title: "Bad",
      description: "Bad",
      instructions: "Bad",
      examples: [],
      scope: "collections",
      audience: "all",
      status: "active",
      exposeToMcp: true,
      collections: [colA],
      policyIds: [],
    },
    {
      slug: `bad_global_${suffix}`,
      title: "Bad",
      description: "Bad",
      instructions: "Bad",
      examples: [],
      scope: "global",
      audience: "policies",
      status: "active",
      exposeToMcp: true,
      collections: [],
      policyIds: [delegatedPolicy],
    },
    {
      slug: `bad_pol_${suffix}`,
      title: "Bad",
      description: "Bad",
      instructions: "Bad",
      examples: [],
      scope: "collections",
      audience: "policies",
      status: "active",
      exposeToMcp: true,
      collections: [colA],
      policyIds: [protectedPolicy],
    },
    {
      slug: `bad_col_${suffix}`,
      title: "Bad",
      description: "Bad",
      instructions: "Bad",
      examples: [],
      scope: "collections",
      audience: "policies",
      status: "active",
      exposeToMcp: true,
      collections: [colB],
      policyIds: [delegatedPolicy],
    },
  ]) {
    assert.equal(
      (await call("POST", "/settings/skills", managerHdr, badPayload))
        .statusCode,
      403,
      badPayload.slug,
    );
  }

  // Manager with empty delegatablePolicyIds gets 403 on write
  const validDelegatedPayload = {
    slug: `delegated_${suffix}`,
    title: "Проверка сделок и расчётов",
    description: "Анализирует записи коллекции A",
    instructions: "Проверь все записи коллекции A.",
    examples: ["Проверь расчёты"],
    scope: "collections",
    audience: "policies",
    status: "active",
    exposeToMcp: true,
    collections: [colA],
    policyIds: [delegatedPolicy],
  };
  assert.equal(
    (
      await call(
        "POST",
        "/settings/skills",
        emptyManagerHdr,
        validDelegatedPayload,
      )
    ).statusCode,
    403,
  );

  // Delegated manager CAN create within scope
  const createdByMgr = await call(
    "POST",
    "/settings/skills",
    managerHdr,
    validDelegatedPayload,
  );
  assert.equal(createdByMgr.statusCode, 201, createdByMgr.body);
  const delegatedSkillId = createdByMgr.json().data.id as string;
  skillIds.push(delegatedSkillId);
  assert.equal(createdByMgr.json().data.manageable, true);

  // Draft skill created by superuser should never be visible to end-users
  const draftSlug = `draft_${suffix}`;
  const draftRes = await call("POST", "/settings/skills", adminHdr, {
    slug: draftSlug,
    title: "Черновик умения",
    description: "Не должен быть виден",
    instructions: "Секрет черновика",
    examples: [],
    scope: "global",
    audience: "all",
    status: "draft",
    exposeToMcp: true,
    collections: [],
    policyIds: [],
  });
  assert.equal(draftRes.statusCode, 201, draftRes.body);
  skillIds.push(draftRes.json().data.id);

  // End-user GET /assistant/skills: sees globalSlug and delegatedSlug, NOT draftSlug, no instructions field
  const catalogRes = await call(
    "GET",
    `/assistant/skills?collection=${colA}&workspaceId=${workspaceId}`,
    endUserHdr,
  );
  assert.equal(catalogRes.statusCode, 200, catalogRes.body);
  const catalogItems = catalogRes.json().data as {
    slug: string;
    instructions?: string;
  }[];
  const slugs = catalogItems.map((s) => s.slug);
  assert.ok(slugs.includes(validDelegatedPayload.slug));
  assert.ok(slugs.includes(globalSlug));
  assert.ok(!slugs.includes(draftSlug));
  assert.ok(catalogItems.every((s) => s.instructions === undefined));
  // Collection-bound skill sorted ahead of global skill when collection param is provided
  assert.ok(
    slugs.indexOf(validDelegatedPayload.slug) < slugs.indexOf(globalSlug),
  );

  // ё->е search on /assistant/skills
  const yoSearch = await call(
    "GET",
    `/assistant/skills?q=${encodeURIComponent("расчет")}`,
    endUserHdr,
  );
  assert.equal(yoSearch.statusCode, 200, yoSearch.body);
  assert.deepEqual(
    yoSearch.json().data.map((s: { slug: string }) => s.slug),
    [validDelegatedPayload.slug],
  );

  // Verify channel='mcp' vs channel='assistant' + readVisibleSkill relatedTerms RBAC
  const endUserAccess = await loadAccess(db, endUserHdr.authorization);
  const adminAccess = await loadAccess(db, adminHdr.authorization);

  const mcpList = await listVisibleSkills(db, endUserAccess, {
    channel: "mcp",
  });
  assert.ok(mcpList.some((s) => s.slug === validDelegatedPayload.slug));
  assert.ok(!mcpList.some((s) => s.slug === globalSlug)); // exposeToMcp=false hidden on mcp!

  assert.equal(
    await readVisibleSkill(db, endUserAccess, globalSlug, { channel: "mcp" }),
    null,
  );
  assert.ok(
    await readVisibleSkill(db, endUserAccess, globalSlug, {
      channel: "assistant",
    }),
  );

  // Related terms RBAC: endUser only sees "Открытый_*" (title), NOT "СкрытаяМаржа_*" (secret_margin)
  const endUserDetail = await readVisibleSkill(
    db,
    endUserAccess,
    validDelegatedPayload.slug,
    { channel: "assistant" },
  );
  assert.ok(endUserDetail);
  assert.deepEqual(
    endUserDetail.relatedTerms.map((term) => term.name),
    [`Открытый_${suffix}`],
  );
  const adminDetail = await readVisibleSkill(
    db,
    adminAccess,
    validDelegatedPayload.slug,
    { channel: "assistant" },
  );
  assert.ok(adminDetail);
  assert.equal(adminDetail.relatedTerms.length, 2);

  // describeCollectionSkills returns only skills bound to colA
  const described = await describeCollectionSkills(
    db,
    colARow.id,
    endUserAccess,
    { channel: "mcp" },
  );
  assert.deepEqual(
    described.skills.map((s) => s.slug),
    [validDelegatedPayload.slug],
  );

  // Cascade safety: delete colB after binding a skill to colB -> skill must stay hidden, never leak globally!
  const cascadeSlug = `cascade_${suffix}`;
  const cascadeCreate = await call("POST", "/settings/skills", adminHdr, {
    slug: cascadeSlug,
    title: "Каскадное умение",
    description: "Привязано только к colB",
    instructions: "Работает с colB",
    examples: [],
    scope: "collections",
    audience: "all",
    status: "active",
    exposeToMcp: true,
    collections: [colB],
    policyIds: [],
  });
  assert.equal(cascadeCreate.statusCode, 201, cascadeCreate.body);
  skillIds.push(cascadeCreate.json().data.id);

  assert.ok(
    await readVisibleSkill(db, adminAccess, cascadeSlug, {
      channel: "assistant",
    }),
  );
  await db.schema.dropTableIfExists(colB);
  await db("public.asmblyr_collections").where({ name: colB }).delete();

  assert.equal(
    await readVisibleSkill(db, adminAccess, cascadeSlug, {
      channel: "assistant",
    }),
    null,
  );
  assert.equal(
    await readVisibleSkill(db, endUserAccess, cascadeSlug, {
      channel: "assistant",
    }),
    null,
  );

  // Delegated manager CAN delete their own in-scope skill
  const delSkill = await call(
    "DELETE",
    `/settings/skills/${delegatedSkillId}`,
    managerHdr,
  );
  assert.equal(delSkill.statusCode, 204, delSkill.body);
});
