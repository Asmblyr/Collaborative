import assert from "node:assert/strict";
import test from "node:test";
import { defaultPresentation } from "../src/components/collections/field-presentation-defaults";
import {
  materializedCardFields,
  materializedNumber,
  materializedValueKind,
} from "../src/components/items/materialized-card-model";
import type { CollectionField } from "../src/components/items/types";

function field(name: string, type = "text"): CollectionField {
  return { name, type, nullable: true, required: false };
}

test("view cards distinguish raw metadata from generated localization defaults", () => {
  const sources = [
    field("title"),
    field("report_date", "date"),
    field("revenue", "decimal"),
    field("private"),
  ];
  const readable = sources.slice(0, 3).map((source) => ({
    ...source,
    presentation: { ...defaultPresentation, label: source.name },
  }));
  const result = materializedCardFields(readable, sources);
  assert.deepEqual(
    result.map((entry) => entry.name),
    ["title", "report_date", "revenue"],
  );
  assert.deepEqual(
    result.map((entry) => [
      entry.presentation?.label,
      entry.presentation?.width,
    ]),
    [
      ["Title", "full"],
      ["Report date", "half"],
      ["Revenue", "half"],
    ],
  );
  assert.equal(sources[1].presentation, undefined);
});

test("view card defaults preserve custom captions, localized labels, widths, rules and formats", () => {
  const source = {
    ...field("revenue", "decimal"),
    presentation: {
      ...defaultPresentation,
      label: "Выручка",
      width: "full" as const,
      display: {
        kind: "number" as const,
        decimals: 2,
        grouping: false,
        prefix: "",
        suffix: " ₽",
      },
      rules: { hidden: true },
    },
  };
  const translated = {
    ...source,
    presentation: { ...source.presentation, label: "Revenue" },
  };
  const [result] = materializedCardFields([translated], [source]);
  assert.equal(result.presentation?.label, "Revenue");
  assert.equal(result.presentation?.width, "full");
  assert.deepEqual(result.presentation?.display, source.presentation.display);
  assert.deepEqual(result.presentation?.rules, source.presentation.rules);
  assert.equal(materializedValueKind(result), null);
});

test("automatic summary values never bypass sensitive, relation or plugin renderers", () => {
  const numeric = field("amount", "decimal");
  assert.equal(materializedValueKind(numeric), "number");
  assert.equal(materializedValueKind(field("enabled", "boolean")), "boolean");
  assert.equal(
    materializedValueKind({
      ...numeric,
      presentation: { ...defaultPresentation, sensitive: true },
    }),
    null,
  );
  assert.equal(
    materializedValueKind({
      ...numeric,
      presentation: {
        ...defaultPresentation,
        extension: { id: "demo:amount", options: {} },
      },
    }),
    null,
  );
  assert.equal(
    materializedValueKind({
      ...numeric,
      relation: {
        kind: "m2o",
        collection: "shops",
        primaryKey: { name: "id", type: "serial" },
        onDelete: "restrict",
      },
    }),
    null,
  );
});

test("view numbers group every digit while preserving bigint and decimal precision", () => {
  assert.equal(
    materializedNumber("9007199254740993.1234567890123400", "ru"),
    "9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0993,12345678901234",
  );
  assert.equal(materializedNumber("-0.00000100", "en"), "-0.000001");
  assert.equal(materializedNumber("125000.5000", "ru"), "125\u00a0000,5");
  assert.equal(materializedNumber(0, "ru"), "0");
  assert.equal(
    materializedNumber("-9223372036854775808", "en"),
    "-9,223,372,036,854,775,808",
  );
});
