import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { copyTranslationKey } from "@asmblyr-collaborative/contracts/translations";
import {
  coreTranslations,
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
          if (
            ts.isCallExpression(node) &&
            node.expression.getText(source) === "copy"
          ) {
            const argument = node.arguments[0];
            if (
              argument &&
              ts.isStringLiteralLike(argument) &&
              /[а-яё]/i.test(argument.text)
            ) {
              const key = copyTranslationKey(argument.text);
              assert.equal(
                coreTranslations.ru[key],
                argument.text,
                `${file}: ${argument.text}`,
              );
              assert.ok(coreTranslations.en[key], `${file}: ${argument.text}`);
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
