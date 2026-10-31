import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  copyTranslationKey,
  coreTranslations,
  pluralizeCopy,
  translateCopy,
} from "@asmblyr-collaborative/contracts/translations";
import {
  formatExactNumber,
  formattedValue,
} from "../src/components/items/value-format";
import { conditionSummary } from "../src/components/access/policy-condition-model";
import type { UiCopy } from "../src/lib/ui-copy-types";

test("the assistant glossary is named as a dictionary rather than legal terms", () => {
  assert.equal(coreTranslations.ru["admin.terms"], "Термины");
  assert.equal(coreTranslations.en["admin.terms"], "Glossary");
});

test("all UI catalogs preserve interpolation parameters and technical tokens", () => {
  for (const [key, source] of Object.entries(coreTranslations.ru)) {
    const translation = coreTranslations.en[key];
    assert.equal(typeof translation, "string", key);
    const parameters = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      parameters(translation),
      parameters(source),
      `${key}: ${source}`,
    );
  }
  assert.equal(translateCopy("Текущий пользователь", "en"), "Current user");
  assert.equal(
    translateCopy("Название пользователя: <script>", "en"),
    "Название пользователя: <script>",
  );
});

test("copy catalogs contain no whitespace-padded values and translateCopy trims fallback lookup", () => {
  for (const [key, value] of Object.entries(coreTranslations.ru)) {
    if (key.startsWith("copy.")) {
      assert.equal(value, value.trim(), `ru padded key ${key}`);
    }
  }
  for (const [key, value] of Object.entries(coreTranslations.en)) {
    if (key.startsWith("copy.")) {
      assert.equal(value, value.trim(), `en padded key ${key}`);
    }
  }
  assert.equal(translateCopy(" Сохранить ", "en"), " Save ");
});

test("pluralizeCopy selects CLDR plural categories in Russian and English", () => {
  const fileForms = {
    one: "Всего {{count}} файл",
    few: "Всего {{count}} файла",
    many: "Всего {{count}} файлов",
  };
  assert.equal(pluralizeCopy(1, fileForms, "ru"), "Всего 1 файл");
  assert.equal(pluralizeCopy(2, fileForms, "ru"), "Всего 2 файла");
  assert.equal(pluralizeCopy(5, fileForms, "ru"), "Всего 5 файлов");
  assert.equal(pluralizeCopy(11, fileForms, "ru"), "Всего 11 файлов");
  assert.equal(pluralizeCopy(21, fileForms, "ru"), "Всего 21 файл");

  assert.equal(pluralizeCopy(0, fileForms, "en"), "0 files total");
  assert.equal(pluralizeCopy(1, fileForms, "en"), "1 file total");
  assert.equal(pluralizeCopy(2, fileForms, "en"), "2 files total");
  assert.equal(pluralizeCopy(21, fileForms, "en"), "21 files total");

  const selectionForms = {
    one: "Выбрана {{count}} запись",
    few: "Выбрано {{count}} записи",
    many: "Выбрано {{count}} записей",
  };
  assert.equal(pluralizeCopy(1, selectionForms, "ru"), "Выбрана 1 запись");
  assert.equal(pluralizeCopy(3, selectionForms, "ru"), "Выбрано 3 записи");
  assert.equal(pluralizeCopy(12, selectionForms, "ru"), "Выбрано 12 записей");
  assert.equal(pluralizeCopy(1, selectionForms, "en"), "1 record selected");
  assert.equal(pluralizeCopy(3, selectionForms, "en"), "3 records selected");
});

test("filter summaries translate built-in parameters but preserve user fields and choices", () => {
  const copy: UiCopy = (source, values) => translateCopy(source, "en", values);
  const summary = conditionSummary(
    {
      logic: "and",
      children: [
        {
          field: "owner",
          op: "eq",
          value: { kind: "context", path: "user.email" },
        },
        {
          field: "state",
          op: "eq",
          value: { kind: "literal", value: "draft" },
        },
      ],
    },
    [
      { name: "owner", label: "Моё поле", type: "text", nullable: true },
      {
        name: "state",
        label: "Мой статус",
        type: "text",
        nullable: true,
        options: [{ value: "draft", label: "Мой черновик" }],
      },
    ],
    copy,
  );
  assert.equal(
    summary,
    "Моё поле = User email · AND · Мой статус = Мой черновик",
  );
});

test("localized exact decimals retain precision and user affixes", () => {
  assert.equal(
    formatExactNumber("9007199254740993.995", 2, true, "en"),
    "9,007,199,254,740,994.00",
  );
  assert.equal(formatExactNumber("1234.56", 2, true), "1\u00a0234,56");
  assert.equal(
    formattedValue(
      "1234.56",
      {
        kind: "number",
        decimals: 2,
        grouping: true,
        prefix: "Цена ",
        suffix: " ₽",
      },
      "en",
    ),
    "Цена 1,234.56 ₽",
  );
});

test("application copy literals are present in both language catalogs", () => {
  function assertCatalogLiteral(file: string, text: string) {
    if (!/[а-яё]/i.test(text)) {
      return;
    }
    const key = copyTranslationKey(text);
    assert.equal(coreTranslations.ru[key], text, `${file}: ${text}`);
    assert.ok(coreTranslations.en[key], `${file}: ${text}`);
  }

  function visitDirectory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visitDirectory(file);
      } else if (/\.tsx?$/.test(entry.name)) {
        const source = ts.createSourceFile(
          file,
          readFileSync(file, "utf8"),
          ts.ScriptTarget.Latest,
          true,
        );
        function visit(node: ts.Node) {
          if (ts.isCallExpression(node)) {
            const callee = node.expression.getText(source);
            if (callee === "copy") {
              const argument = node.arguments[0];
              if (argument && ts.isStringLiteralLike(argument)) {
                assertCatalogLiteral(file, argument.text);
              }
            } else if (callee === "copy.plural" || callee === "pluralCopy") {
              const formsArgument =
                callee === "pluralCopy" ? node.arguments[2] : node.arguments[1];
              if (
                formsArgument &&
                ts.isObjectLiteralExpression(formsArgument)
              ) {
                for (const property of formsArgument.properties) {
                  if (
                    ts.isPropertyAssignment(property) &&
                    ts.isStringLiteralLike(property.initializer)
                  ) {
                    assertCatalogLiteral(file, property.initializer.text);
                  }
                }
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(source);
      }
    }
  }
  visitDirectory(path.resolve("src"));
});
