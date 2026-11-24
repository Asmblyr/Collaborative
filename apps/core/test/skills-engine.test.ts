import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSkillDetail } from "@asmblyr-collaborative/contracts";
import type { Access } from "../src/permissions/access.js";
import { AccessDeniedError } from "../src/permissions/access.js";
import {
  assertManageableSkillTarget,
  buildSkillAdminMeta,
  canManageSkillTarget,
  type SkillManagerScope,
} from "../src/skills/access.js";
import {
  formatSkillMarkdown,
  isSkillVisible,
  matchesSkillSearch,
  type SkillVisibilityCandidate,
} from "../src/skills/visibility.js";

const POLICY_A = "11111111-1111-4111-8111-111111111111";
const POLICY_B = "22222222-2222-4222-8222-222222222222";
const POLICY_PROTECTED = "33333333-3333-4333-8333-333333333333";

function makeAccess(options: {
  superuser?: boolean;
  readableCollections?: string[];
}): Access {
  const grants = new Map<string, string[]>();
  for (const collection of options.readableCollections ?? []) {
    grants.set(`${collection}:read`, ["*"]);
  }
  return {
    principal: {
      kind: "user",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "user@corp.local",
      superuser: Boolean(options.superuser),
      tokenId: "token-1",
    },
    grants,
  };
}

function makeCandidate(
  overrides: Partial<SkillVisibilityCandidate> = {},
): SkillVisibilityCandidate {
  return {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    slug: "deal-review",
    title: "Отчёт по сделкам",
    description: "Проверяет статус сделок",
    instructions: "1. Получи список сделок.",
    examples: ["Сделай отчёт по сделкам"],
    scope: "collections",
    audience: "policies",
    status: "active",
    exposeToMcp: true,
    collections: [
      { id: "c1", name: "deals", mcpEnabled: true },
      { id: "c2", name: "clients", mcpEnabled: true },
    ],
    policyIds: [POLICY_A],
    updatedAt: "2026-11-24T10:00:00.000Z",
    ...overrides,
  };
}

test("isSkillVisible enforces status, expose_to_mcp channel gating, Layer 1 collection access & cascade safety, and Layer 2 policy intersection", () => {
  const superuser = makeAccess({ superuser: true });
  const salesUser = makeAccess({ readableCollections: ["deals", "clients"] });
  const dealsOnlyUser = makeAccess({ readableCollections: ["deals"] });

  // Draft skills are always hidden on both channels, even for superusers
  const draft = makeCandidate({
    status: "draft",
    scope: "global",
    audience: "all",
  });
  assert.equal(isSkillVisible(draft, superuser, new Set(), "assistant"), false);
  assert.equal(isSkillVisible(draft, superuser, new Set(), "mcp"), false);

  // expose_to_mcp=false is visible on assistant channel, hidden on mcp channel (even for superuser)
  const internalOnly = makeCandidate({
    exposeToMcp: false,
    scope: "global",
    audience: "all",
  });
  assert.equal(
    isSkillVisible(internalOnly, salesUser, new Set([POLICY_A]), "assistant"),
    true,
  );
  assert.equal(
    isSkillVisible(internalOnly, salesUser, new Set([POLICY_A]), "mcp"),
    false,
  );
  assert.equal(
    isSkillVisible(internalOnly, superuser, new Set(), "mcp"),
    false,
  );

  // Layer 1: must have read grant to ALL bound collections
  const skill = makeCandidate();
  assert.equal(
    isSkillVisible(skill, salesUser, new Set([POLICY_A]), "assistant"),
    true,
  );
  assert.equal(
    isSkillVisible(skill, salesUser, new Set([POLICY_A]), "mcp"),
    true,
  );
  assert.equal(
    isSkillVisible(skill, dealsOnlyUser, new Set([POLICY_A]), "assistant"),
    false,
  );

  // Layer 1 cascade safety: scope='collections' with 0 remaining rows MUST stay hidden even for superuser
  const orphanedCollections = makeCandidate({
    scope: "collections",
    collections: [],
    audience: "all",
  });
  assert.equal(
    isSkillVisible(
      orphanedCollections,
      salesUser,
      new Set([POLICY_A]),
      "assistant",
    ),
    false,
  );
  assert.equal(
    isSkillVisible(orphanedCollections, superuser, new Set(), "assistant"),
    false,
  );

  // Layer 2: audience='policies' requires policy intersection for non-superuser; superuser still sees active skill
  assert.equal(
    isSkillVisible(skill, salesUser, new Set([POLICY_B]), "assistant"),
    false,
  );
  assert.equal(isSkillVisible(skill, superuser, new Set(), "assistant"), true);

  // Layer 2 cascade safety: audience='policies' with 0 remaining policies hidden for non-superuser, visible to superuser
  const orphanedPolicies = makeCandidate({
    scope: "global",
    collections: [],
    audience: "policies",
    policyIds: [],
  });
  assert.equal(
    isSkillVisible(
      orphanedPolicies,
      salesUser,
      new Set([POLICY_A]),
      "assistant",
    ),
    false,
  );
  assert.equal(
    isSkillVisible(orphanedPolicies, superuser, new Set(), "assistant"),
    true,
  );
});

test("matchesSkillSearch supports ё/е equivalence across title, description, examples, slug, and collections", () => {
  const summary = {
    slug: "financial-review",
    title: "Финансовый отчёт",
    description: "Анализ жёлтых флагов по проектам",
    examples: ["Проверь контролёра сделки"],
    collections: ["deals"],
  };
  assert.equal(matchesSkillSearch(summary, "отчет"), true);
  assert.equal(matchesSkillSearch(summary, "ОТЧЁТ"), true);
  assert.equal(matchesSkillSearch(summary, "желтых"), true);
  assert.equal(matchesSkillSearch(summary, "контролера"), true);
  assert.equal(matchesSkillSearch(summary, "financial"), true);
  assert.equal(matchesSkillSearch(summary, "deals"), true);
  assert.equal(matchesSkillSearch(summary, "несуществующий"), false);
});

test("formatSkillMarkdown emits valid YAML frontmatter, body, examples, and related terms", () => {
  const detail: AssistantSkillDetail = {
    slug: "deal-review",
    title: 'Разбор: "Крупная сделка"',
    description: "Проверка рисков и этапов",
    instructions: "## Порядок действий\n\n1. Проверь сумму сделки.",
    examples: ["Разбери сделку Озон"],
    scope: "collections",
    collections: ["deals"],
    exposeToMcp: true,
    updatedAt: "2026-11-24T10:00:00.000Z",
    relatedTerms: [
      {
        collection: "deals",
        id: "t1",
        name: "Крупная сделка",
        description: "Сделка от 5 млн руб.",
        aliases: ["enterprise"],
        filter: { logic: "and", children: [] },
      },
    ],
  };

  const md = formatSkillMarkdown(detail);
  assert.match(md, /^---\n/);
  assert.match(md, /slug: "deal-review"/);
  assert.match(md, /title: "Разбор: \\"Крупная сделка\\""/);
  assert.match(md, /collections:\n  - "deals"/);
  assert.match(md, /expose_to_mcp: true/);
  assert.match(md, /## Порядок действий/);
  assert.match(md, /## Примеры запросов\n\n- Разбери сделку Озон/);
  assert.match(
    md,
    /## Связанные термины словаря\n\n- \*\*Крупная сделка\*\* \(`deals`\) \(синонимы: enterprise\): Сделка от 5 млн руб\./,
  );
});

test("delegated management boundaries enforce policy delegation, collection read access, and superuser privileges", () => {
  const superuser: SkillManagerScope = {
    superuser: true,
    canEditSkills: true,
    delegatablePolicyIds: new Set(),
    readableCollections: new Set(),
  };
  const manager: SkillManagerScope = {
    superuser: false,
    canEditSkills: true,
    delegatablePolicyIds: new Set([POLICY_A, POLICY_B]),
    readableCollections: new Set(["projects", "tasks"]),
  };
  const emptyDelegationManager: SkillManagerScope = {
    superuser: false,
    canEditSkills: true,
    delegatablePolicyIds: new Set(),
    readableCollections: new Set(["projects"]),
  };
  const readOnlyManager: SkillManagerScope = {
    superuser: false,
    canEditSkills: false,
    delegatablePolicyIds: new Set([POLICY_A]),
    readableCollections: new Set(["projects"]),
  };

  // Superuser can manage any scope/audience
  assert.equal(
    canManageSkillTarget(superuser, {
      scope: "global",
      audience: "all",
      collections: [],
      policyIds: [],
    }),
    true,
  );

  // Delegated manager can manage strictly within readable collections + delegatable policies
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "collections",
      audience: "policies",
      collections: ["projects"],
      policyIds: [POLICY_A],
    }),
    true,
  );

  // Delegated manager blocked from audience='all' or scope='global'
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "collections",
      audience: "all",
      collections: ["projects"],
      policyIds: [],
    }),
    false,
  );
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "global",
      audience: "policies",
      collections: [],
      policyIds: [POLICY_A],
    }),
    false,
  );

  // Delegated manager blocked from protected policy or unreadable/system collection
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "collections",
      audience: "policies",
      collections: ["projects"],
      policyIds: [POLICY_A, POLICY_PROTECTED],
    }),
    false,
  );
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "collections",
      audience: "policies",
      collections: ["projects", "deals"],
      policyIds: [POLICY_A],
    }),
    false,
  );
  assert.equal(
    canManageSkillTarget(manager, {
      scope: "collections",
      audience: "policies",
      collections: ["asmblyr_users"],
      policyIds: [POLICY_A],
    }),
    false,
  );

  // Empty delegatablePolicyIds or read-only section grant -> denied (403)
  assert.throws(
    () =>
      assertManageableSkillTarget(emptyDelegationManager, {
        scope: "collections",
        audience: "policies",
        collections: ["projects"],
        policyIds: [POLICY_A],
      }),
    AccessDeniedError,
  );
  assert.throws(
    () =>
      assertManageableSkillTarget(readOnlyManager, {
        scope: "collections",
        audience: "policies",
        collections: ["projects"],
        policyIds: [POLICY_A],
      }),
    AccessDeniedError,
  );

  // Admin metadata accurately reflects permissions
  assert.deepEqual(buildSkillAdminMeta(superuser), {
    superuser: true,
    canCreate: true,
    canUseGlobalScope: true,
    canUseAllAudience: true,
    delegatablePolicyIds: [],
  });
  assert.equal(buildSkillAdminMeta(manager).canCreate, true);
  assert.equal(buildSkillAdminMeta(manager).canUseGlobalScope, false);
  assert.equal(buildSkillAdminMeta(manager).canUseAllAudience, false);
  assert.equal(buildSkillAdminMeta(emptyDelegationManager).canCreate, false);
  assert.equal(buildSkillAdminMeta(readOnlyManager).canCreate, false);
});
