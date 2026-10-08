import test from "node:test";
import assert from "node:assert/strict";
import {
  httpText,
  localizeSpec,
  localizeTypeDoc,
  assertPairs,
} from "./localization.mjs";
import { guideLinks } from "./guides.mjs";

test("OpenAPI translation preserves executable contract and fails on missing prose", () => {
  const original = {
    description: "Успех",
    security: [{ bearerAuth: [] }],
    properties: {
      title: { type: "string", enum: ["Успех"], example: "Успех" },
    },
    example: { description: "Успех", title: "Успех" },
  };
  const localized = localizeSpec(original, "en");
  assert.equal(localized.description, "Success");
  assert.deepEqual(localized.security, original.security);
  assert.deepEqual(localized.properties, original.properties);
  assert.deepEqual(localized.example, original.example);
  assert.equal(original.description, "Успех");
  assert.throws(
    () => httpText("Новая непереведённая операция", "en"),
    /Missing/,
  );
});

test("route source and route-only disclaimer survive translation", () => {
  assert.equal(
    httpText(
      "Успех. Схемы тела и ответа пока не детализированы; см. реализацию обработчика. Источник: handler.ts",
      "en",
    ),
    "Success. Body/response schemas are not yet detailed; see the handler. Source: handler.ts",
  );
});

test("guide links resolve source relationships in the selected locale", () => {
  assert.equal(
    guideLinks(
      "[SDK](../sdk/README.ru.md#пример) [Data](../../docs/ru/features/data.md)",
      "packages/kit/README.ru.md",
      "ru",
    ),
    "[SDK](sdk-guide.md#пример) [Data](../features/data.md)",
  );
  assert.equal(
    guideLinks("[Hooks](HOOKS.md)", "packages/kit/README.md", "en"),
    "[Hooks](kit-hooks.md)",
  );
});

test("locale coverage catches missing and orphaned pages", () => {
  assertPairs(["a.md"], ["a.md"]);
  assert.throws(() => assertPairs(["a.md"], []), /missing RU a.md/);
  assert.throws(() => assertPairs([], ["b.md"]), /missing EN b.md/);
});

test("TypeDoc keeps code and signatures while translating headings", () => {
  assert.equal(
    localizeTypeDoc("## Parameters\n\n```ts\nEnglish code\n```"),
    "## Параметры {#parameters}\n\n```ts\nEnglish code\n```",
  );
  assert.throws(
    () => localizeTypeDoc("A new undocumented comment."),
    /Missing Russian/,
  );
  assert.match(localizeTypeDoc("## Returns\n## Returns"), /\{#returns-1\}/);
  assert.match(
    localizeTypeDoc(
      "| Description |\n| Successful writes can return no data when the caller has no read permission. |",
    ),
    /Успешная запись/,
  );
});
