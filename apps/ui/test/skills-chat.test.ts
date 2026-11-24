import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSkillSummary } from "@asmblyr-collaborative/contracts";
import {
  buildAssistantSkillsUrl,
  cloneRetrySnapshot,
  collectWelcomeSkillExamples,
  createSendSnapshot,
  filterAndGroupSkills,
  groupAssistantSkills,
  matchesSkillQuery,
  normalizeSkillQuery,
  parseSlashSkillQuery,
  stripSlashSkillPrefix,
} from "../src/components/assistant/assistant-skills-state";

function makeSkill(
  overrides: Partial<AssistantSkillSummary> & { slug: string; title: string },
): AssistantSkillSummary {
  return {
    description: "",
    examples: [],
    scope: "global",
    collections: [],
    exposeToMcp: false,
    updatedAt: "2026-11-24T00:00:00.000Z",
    ...overrides,
  };
}

test("normalizeSkillQuery folds ё to е and trims case-insensitively", () => {
  assert.equal(
    normalizeSkillQuery("  Еженедельный Отчёт "),
    "еженедельный отчет",
  );
  assert.equal(normalizeSkillQuery("ЁЛКА"), "елка");
  assert.equal(normalizeSkillQuery("Proj-Status"), "proj-status");
});

test("parseSlashSkillQuery triggers only for leading single-token slash prefixes", () => {
  assert.equal(parseSlashSkillQuery("/"), "");
  assert.equal(parseSlashSkillQuery("/proj"), "proj");
  assert.equal(parseSlashSkillQuery("/отчёт"), "отчёт");
  assert.equal(parseSlashSkillQuery("/team_triage-1"), "team_triage-1");

  assert.equal(parseSlashSkillQuery(""), null);
  assert.equal(parseSlashSkillQuery("привет /proj"), null);
  assert.equal(parseSlashSkillQuery("/proj разбери задачи"), null);
  assert.equal(parseSlashSkillQuery("/proj\nвторая строка"), null);
  assert.equal(parseSlashSkillQuery(" /proj"), null);
});

test("stripSlashSkillPrefix removes leading /query while preserving non-slash drafts", () => {
  assert.equal(stripSlashSkillPrefix("/"), "");
  assert.equal(stripSlashSkillPrefix("/proj"), "");
  assert.equal(stripSlashSkillPrefix("/proj разбери задачи"), "разбери задачи");
  assert.equal(stripSlashSkillPrefix("разбери задачи"), "разбери задачи");
  assert.equal(stripSlashSkillPrefix(""), "");
});

test("matchesSkillQuery supports ё/е equivalence across slug, title, description, and examples", () => {
  const reportSkill = makeSkill({
    slug: "weekly-report",
    title: "Отчёт по сделкам",
    description: "Сводка с расчётом маржи",
    examples: ["Покажи просроченные платёжки"],
    scope: "collections",
    collections: ["deals"],
  });

  assert.equal(matchesSkillQuery(reportSkill, ""), true);
  assert.equal(matchesSkillQuery(reportSkill, "отчет"), true);
  assert.equal(matchesSkillQuery(reportSkill, "ОТЧЁТ"), true);
  assert.equal(matchesSkillQuery(reportSkill, "расчет"), true);
  assert.equal(matchesSkillQuery(reportSkill, "платежки"), true);
  assert.equal(matchesSkillQuery(reportSkill, "weekly"), true);
  assert.equal(matchesSkillQuery(reportSkill, "deals"), true);
  assert.equal(matchesSkillQuery(reportSkill, "несуществующий"), false);
});

test("groupAssistantSkills and filterAndGroupSkills separate current collection skills from general skills", () => {
  const tasksSkill = makeSkill({
    slug: "team-tasks-triage",
    title: "Триаж задач команды",
    description: "Разбор заблокированных задач",
    scope: "collections",
    collections: ["tasks"],
  });
  const projectsTasksSkill = makeSkill({
    slug: "weekly-project-status",
    title: "Еженедельный статус по проектам",
    description: "Сводка по проектам и задачам",
    scope: "collections",
    collections: ["projects", "tasks"],
  });
  const dealsSkill = makeSkill({
    slug: "hot-deals-review",
    title: "Разбор горячих сделок",
    description: "Сделки на закрытии",
    scope: "collections",
    collections: ["deals"],
  });
  const globalSkill = makeSkill({
    slug: "general-digest",
    title: "Общий дайджест",
    description: "Обзор по всем данным",
    scope: "global",
    collections: [],
  });

  const all = [globalSkill, dealsSkill, projectsTasksSkill, tasksSkill];

  const onTasks = groupAssistantSkills(all, "tasks");
  assert.deepEqual(
    onTasks.collectionSkills.map((s) => s.slug),
    ["weekly-project-status", "team-tasks-triage"],
  );
  assert.deepEqual(
    onTasks.generalSkills.map((s) => s.slug),
    ["general-digest", "hot-deals-review"],
  );
  assert.deepEqual(
    onTasks.flatSkills.map((s) => s.slug),
    [
      "weekly-project-status",
      "team-tasks-triage",
      "general-digest",
      "hot-deals-review",
    ],
  );

  const withoutCollection = groupAssistantSkills(all, null);
  assert.deepEqual(withoutCollection.collectionSkills, []);
  assert.equal(withoutCollection.generalSkills.length, 4);

  const filtered = filterAndGroupSkills(all, "разбор", "tasks");
  assert.deepEqual(
    filtered.collectionSkills.map((s) => s.slug),
    ["team-tasks-triage"],
  );
  assert.deepEqual(
    filtered.generalSkills.map((s) => s.slug),
    ["hot-deals-review"],
  );
});

test("collectWelcomeSkillExamples prioritizes current collection skills and caps total chips", () => {
  const globalSkill = makeSkill({
    slug: "global-helper",
    title: "Общий помощник",
    scope: "global",
    examples: ["Глобальный пример 1", "Глобальный пример 2"],
  });
  const tasksSkillA = makeSkill({
    slug: "tasks-a",
    title: "Триаж",
    scope: "collections",
    collections: ["tasks"],
    examples: ["Задача A1", "Задача A2", "Задача A3"],
  });
  const tasksSkillB = makeSkill({
    slug: "tasks-b",
    title: "Статус",
    scope: "collections",
    collections: ["projects", "tasks"],
    examples: ["Задача B1", "Задача B2"],
  });

  const examples = collectWelcomeSkillExamples(
    [globalSkill, tasksSkillA, tasksSkillB],
    "tasks",
    5,
  );
  assert.equal(examples.length, 5);
  // Collection skills appear before global skills and are distributed fairly.
  assert.deepEqual(
    examples.map((item) => `${item.skill.slug}:${item.prompt}`),
    [
      "tasks-a:Задача A1",
      "tasks-b:Задача B1",
      "tasks-a:Задача A2",
      "tasks-b:Задача B2",
      "tasks-a:Задача A3",
    ],
  );
  assert.equal(
    examples.every((item) => item.isCollectionSkill),
    true,
  );

  const withGlobalFallback = collectWelcomeSkillExamples(
    [globalSkill, tasksSkillB],
    "tasks",
    4,
  );
  assert.deepEqual(
    withGlobalFallback.map((item) => item.skill.slug),
    ["tasks-b", "tasks-b", "global-helper", "global-helper"],
  );
});

test("buildAssistantSkillsUrl encodes collection and workspaceId only when present", () => {
  assert.equal(buildAssistantSkillsUrl(null, null), "/api/assistant/skills");
  assert.equal(
    buildAssistantSkillsUrl("tasks", null),
    "/api/assistant/skills?collection=tasks",
  );
  assert.equal(
    buildAssistantSkillsUrl("tasks", "ws-1"),
    "/api/assistant/skills?collection=tasks&workspaceId=ws-1",
  );
  assert.equal(
    buildAssistantSkillsUrl("", "ws-2"),
    "/api/assistant/skills?workspaceId=ws-2",
  );
});

test("SendSnapshot preserves skillSlug across retry and regenerate snapshots", () => {
  const initial = createSendSnapshot({
    content: "Разбери мои заблокированные задачи",
    messageId: "msg-1",
    settings: { reasoningEffort: "medium", thinking: true },
    context: { page: "items", workspaceId: "ws-1", collection: "tasks" },
    dataAccess: { enabled: true, workspaceId: "ws-1" },
    skillSlug: "team-tasks-triage",
  });

  assert.equal(initial.skillSlug, "team-tasks-triage");

  const retried = cloneRetrySnapshot(initial, {
    enabled: true,
    workspaceId: "ws-1",
  });
  assert.equal(retried.skillSlug, "team-tasks-triage");
  assert.notEqual(retried, initial);

  const retriedDataOff = cloneRetrySnapshot(initial, {
    enabled: false,
    workspaceId: "ws-1",
  });
  assert.equal(retriedDataOff.skillSlug, "team-tasks-triage");
  assert.equal(retriedDataOff.dataAccess?.enabled, false);

  const withoutSkill = createSendSnapshot({
    content: "Обычный вопрос",
    messageId: "msg-2",
    settings: {},
    context: null,
  });
  assert.equal(withoutSkill.skillSlug, null);
  assert.equal(cloneRetrySnapshot(withoutSkill).skillSlug, null);
});
