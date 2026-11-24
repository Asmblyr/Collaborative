import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidSkillSlug,
  normalizeSearch,
  parseSkillCatalogQuery,
  parseSkillId,
  parseSkillInput,
  parseSkillSlug,
} from "../src/skills/validation.js";

const VALID_POLICY_ID = "11111111-1111-4111-8111-111111111111";

function baseInput() {
  return {
    slug: "deal-review_v1",
    title: "Разбор сделки",
    description: "Проверяет риски и ключевые этапы по сделке.",
    instructions: "## Шаги\n1. Проверь сумму.\n2. Проверь маржу.",
    examples: ["Разбери сделку Озон"],
    scope: "global" as const,
    audience: "all" as const,
    status: "active" as const,
    exposeToMcp: true,
    collections: [] as string[],
    policyIds: [] as string[],
  };
}

test("slug validation accepts canonical slugs and rejects invalid formats", () => {
  assert.equal(isValidSkillSlug("a"), true);
  assert.equal(isValidSkillSlug("0-9_a-z"), true);
  assert.equal(parseSkillSlug("  deal-review_2  "), "deal-review_2");
  assert.equal(parseSkillSlug("a".repeat(64)), "a".repeat(64));

  for (const invalid of [
    "",
    "   ",
    "Deal-Review",
    "-leading-dash",
    "_leading_underscore",
    "has space",
    "кириллица",
    "slash/slug",
    "dot.slug",
    "a".repeat(65),
  ]) {
    assert.equal(isValidSkillSlug(invalid), false, invalid);
    assert.throws(() => parseSkillSlug(invalid), { statusCode: 400 });
  }
});

test("normalizeSearch folds ё to е and lowercases in Russian locale", () => {
  assert.equal(normalizeSearch("  Ёлочный Отчёт  "), "елочный отчет");
  assert.equal(normalizeSearch("Отчет по СДЕЛКАМ"), "отчет по сделкам");
  assert.equal(normalizeSearch("Финансовый контролёр"), "финансовый контролер");
});

test("parseSkillInput validates scope, audience, examples, limits, and system collections", () => {
  const globalParsed = parseSkillInput(baseInput());
  assert.equal(globalParsed.slug, "deal-review_v1");
  assert.deepEqual(globalParsed.collections, []);
  assert.deepEqual(globalParsed.policyIds, []);

  // Collections scope requires at least one non-system collection
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        scope: "collections",
        collections: [],
      }),
    { statusCode: 400 },
  );
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        scope: "collections",
        collections: ["asmblyr_users"],
      }),
    { statusCode: 400 },
  );
  const scopedParsed = parseSkillInput({
    ...baseInput(),
    scope: "collections",
    collections: ["deals", "deals", "clients"],
  });
  assert.deepEqual(scopedParsed.collections, ["deals", "clients"]);

  // Global scope clears stale collection selections if provided
  const globalCleared = parseSkillInput({
    ...baseInput(),
    scope: "global",
    collections: ["deals"],
  });
  assert.deepEqual(globalCleared.collections, []);

  // Policy audience requires at least one valid policy UUID
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        audience: "policies",
        policyIds: [],
      }),
    { statusCode: 400 },
  );
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        audience: "policies",
        policyIds: ["not-a-uuid"],
      }),
    { statusCode: 400 },
  );
  const policyParsed = parseSkillInput({
    ...baseInput(),
    audience: "policies",
    policyIds: [VALID_POLICY_ID.toUpperCase(), VALID_POLICY_ID],
  });
  assert.deepEqual(policyParsed.policyIds, [VALID_POLICY_ID]);

  // Examples limits (max 5, each <= 200 chars)
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        examples: ["1", "2", "3", "4", "5", "6"],
      }),
    { statusCode: 400 },
  );
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        examples: ["x".repeat(201)],
      }),
    { statusCode: 400 },
  );

  // Instructions max 12_000 chars and disallow null/control chars while permitting newlines/tabs
  assert.equal(
    parseSkillInput({
      ...baseInput(),
      instructions: "Line 1\n\tLine 2\r\nLine 3",
    }).instructions,
    "Line 1\n\tLine 2\r\nLine 3",
  );
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        instructions: "a".repeat(12_001),
      }),
    { statusCode: 400 },
  );
  assert.throws(
    () =>
      parseSkillInput({
        ...baseInput(),
        instructions: "bad\u0000byte",
      }),
    { statusCode: 400 },
  );

  // Unknown keys rejected
  assert.throws(() => parseSkillInput({ ...baseInput(), extra: true }), {
    statusCode: 400,
  });
});

test("parseSkillId and parseSkillCatalogQuery validate query parameters cleanly", () => {
  assert.equal(parseSkillId(VALID_POLICY_ID.toUpperCase()), VALID_POLICY_ID);
  assert.throws(() => parseSkillId("bad"), { statusCode: 400 });

  assert.deepEqual(parseSkillCatalogQuery(undefined), {
    collection: null,
    workspaceId: null,
    q: null,
    limit: 50,
  });
  assert.deepEqual(
    parseSkillCatalogQuery({
      collection: "deals",
      workspaceId: VALID_POLICY_ID.toUpperCase(),
      q: "  отчёт ",
      limit: "25",
    }),
    {
      collection: "deals",
      workspaceId: VALID_POLICY_ID,
      q: "отчёт",
      limit: 25,
    },
  );
  assert.throws(() => parseSkillCatalogQuery({ collection: "asmblyr_users" }), {
    statusCode: 400,
  });
  assert.throws(() => parseSkillCatalogQuery({ workspaceId: "invalid" }), {
    statusCode: 400,
  });
  assert.throws(() => parseSkillCatalogQuery({ limit: "0" }), {
    statusCode: 400,
  });
  assert.throws(() => parseSkillCatalogQuery({ limit: "101" }), {
    statusCode: 400,
  });
});
