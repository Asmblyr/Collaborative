import assert from "node:assert/strict";
import test from "node:test";
import type {
  AssistantSkill,
  AssistantSkillAdminMeta,
} from "@asmblyr-collaborative/contracts";
import {
  copyTranslationKey,
  coreTranslations,
} from "@asmblyr-collaborative/contracts/translations";
import { settingsCatalog } from "../src/components/admin/settings/sections";
import {
  canSubmitSkillValues,
  createInitialSkillValues,
  filterSkills,
  isValidSkillSlug,
  normalizeSkillSearch,
  suggestSkillSlug,
  toSkillInput,
} from "../src/components/skills/skill-utils";

const sampleSkills: AssistantSkill[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "otchet-sdelki",
    title: "Отчёт по сделкам",
    description: "Анализ воронки продаж и просроченных этапов",
    instructions: "## Шаги\n1. Проверить сделки.",
    examples: ["Покажи просроченные сделки"],
    scope: "collections",
    audience: "policies",
    status: "active",
    exposeToMcp: true,
    collections: ["deals"],
    collectionDetails: [
      { name: "deals", displayName: "Сделки", mcpEnabled: true },
    ],
    policyIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    policies: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Менеджеры продаж" },
    ],
    manageable: true,
    coverage: {
      audienceUsersCount: 5,
      collectionNames: ["deals"],
      mcpReady: true,
    },
    createdBy: null,
    createdByName: "Admin",
    updatedBy: null,
    updatedByName: "Admin",
    createdAt: "2026-11-24T08:00:00.000Z",
    updatedAt: "2026-11-24T09:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "draft-audit",
    title: "Черновик аудита",
    description: "Внутренний чеклист",
    instructions: "Проверить логи.",
    examples: [],
    scope: "global",
    audience: "all",
    status: "draft",
    exposeToMcp: false,
    collections: [],
    collectionDetails: [],
    policyIds: [],
    policies: [],
    manageable: false,
    coverage: {
      audienceUsersCount: 12,
      collectionNames: [],
      mcpReady: false,
    },
    createdBy: null,
    createdByName: "Admin",
    updatedBy: null,
    updatedByName: "Admin",
    createdAt: "2026-11-24T07:00:00.000Z",
    updatedAt: "2026-11-24T07:30:00.000Z",
  },
];

test("settingsCatalog registers skills under Возможности with localized RU/EN copy", () => {
  const entry = settingsCatalog.find((section) => section.id === "skills");
  assert.ok(entry);
  assert.equal(entry.group, "Возможности");
  for (const text of [entry.title, entry.description]) {
    const key = copyTranslationKey(text);
    assert.equal(coreTranslations.ru[key], text);
    assert.ok(coreTranslations.en[key]);
  }
});

test("suggestSkillSlug transliterates Russian titles into valid lowercase slugs", () => {
  const slug = suggestSkillSlug("Еженедельный отчёт по сделкам!");
  assert.equal(slug, "ezhenedelnyy-otchet-po-sdelkam");
  assert.equal(isValidSkillSlug(slug), true);
  assert.equal(suggestSkillSlug("___Test  Skill 2026"), "test-skill-2026");
  assert.equal(isValidSkillSlug("bad slug"), false);
  assert.equal(isValidSkillSlug("-bad"), false);
  assert.equal(isValidSkillSlug("ok_slug-1"), true);
});

test("normalizeSkillSearch and filterSkills support ё/е equivalence and status/MCP filters", () => {
  assert.equal(normalizeSkillSearch("  Отчёт по Ёлке "), "отчет по елке");
  assert.equal(
    filterSkills(sampleSkills, { query: "отчет", status: "all", mcp: "all" })
      .length,
    1,
  );
  assert.equal(
    filterSkills(sampleSkills, {
      query: "/otchet-sdelki",
      status: "active",
      mcp: "mcp",
    }).length,
    1,
  );
  assert.equal(
    filterSkills(sampleSkills, { query: "", status: "draft", mcp: "all" })
      .length,
    1,
  );
  assert.equal(
    filterSkills(sampleSkills, { query: "", status: "draft", mcp: "mcp" })
      .length,
    0,
  );
});

test("delegated manager defaults lock scope to collections and audience to policies", () => {
  const delegatedMeta: AssistantSkillAdminMeta = {
    superuser: false,
    canCreate: true,
    canUseGlobalScope: false,
    canUseAllAudience: false,
    delegatablePolicyIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  };
  const draft = createInitialSkillValues(null, delegatedMeta);
  assert.equal(draft.scope, "collections");
  assert.equal(draft.audience, "policies");
  assert.deepEqual(draft.policyIds, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  assert.equal(canSubmitSkillValues(draft), false);

  const validDraft = {
    ...draft,
    title: "Триаж задач",
    slug: "tasks-triage",
    description: "Разбор срочных задач",
    instructions: "1. Найти просроченные задачи.",
    examples: ["  Разбери задачи  ", "   "],
    collections: ["tasks"],
  };
  assert.equal(canSubmitSkillValues(validDraft), true);
  const input = toSkillInput(validDraft);
  assert.deepEqual(input.examples, ["Разбери задачи"]);
  assert.deepEqual(input.collections, ["tasks"]);
});

test("chat pre-registered skill copy keys exist in both RU and EN catalogs", () => {
  const expected: Record<string, string> = {
    Умения: "Skills",
    "Умения ассистента": "Assistant skills",
    "Поиск умений…": "Search skills…",
    "Для текущей коллекции": "For current collection",
    "Общие умения": "General skills",
    "Умения не найдены": "No skills found",
    "Выбрать умение": "Select skill",
    "Убрать умение": "Remove skill",
    "Введите / для выбора умения": "Type / to choose a skill",
    "Сценарии и подсказки": "Skills and prompts",
    "Примеры умений": "Skill examples",
    "Умение недоступно": "Skill is unavailable",
    "Нет доступных умений": "No available skills",
    "Активное умение: {{value0}}": "Active skill: {{value0}}",
  };
  for (const [ruText, enText] of Object.entries(expected)) {
    const key = copyTranslationKey(ruText);
    assert.equal(coreTranslations.ru[key], ruText, ruText);
    assert.equal(coreTranslations.en[key], enText, ruText);
  }
});
