import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TagsInput } from "../src/components/items/tags-input";
import { TagsValue } from "../src/components/items/tags-value";
import {
  copyTranslationKey,
  translateCopy,
} from "@asmblyr-collaborative/contracts/translations";
import { parseTags, TagValueError } from "@asmblyr-collaborative/contracts";
import { payloadValue } from "../src/components/items/item-input-values";
import { tagsDraft, tagErrorMessage } from "../src/components/items/tag-values";
import type { CollectionField } from "../src/components/items/types";

const field: CollectionField = {
  name: "tags",
  type: "json",
  required: false,
  nullable: true,
  presentation: {
    interface: "tags",
    label: "Теги",
    description: "",
    placeholder: "",
    width: "full",
    order: 0,
    group: "",
  },
};

test("tags drafts and submission preserve legacy JSON and validate explicit edits", () => {
  assert.deepEqual(tagsDraft('[" Kraft ","Heinz"]'), ["Kraft", "Heinz"]);
  assert.deepEqual(tagsDraft(""), []);
  assert.deepEqual(tagsDraft("null"), []);
  for (const source of ['{"keep":true}', '["a",2]', '["a"," a "]', "[bad"]) {
    assert.equal(tagsDraft(source), null);
    assert.throws(() => payloadValue(field, source));
  }
  assert.deepEqual(payloadValue(field, '[" Kraft ","KRAFT"]'), [
    "Kraft",
    "KRAFT",
  ]);
  assert.deepEqual(payloadValue(field, "[]"), []);
  assert.equal(payloadValue(field, "null"), null);
  assert.equal(payloadValue(field, ""), null);
  assert.throws(
    () => payloadValue({ ...field, required: true }, "[]"),
    /хотя бы один тег/,
  );
  assert.throws(() => payloadValue({ ...field, required: true }, "null"));
  assert.throws(() => payloadValue(field, '["same"," same "]'), /уже добавлен/);
  assert.deepEqual(
    payloadValue({ ...field, presentation: undefined }, '{"keep":true}'),
    { keep: true },
  );
});

test("tag errors are localized while tag values stay user authored", () => {
  const english = (source: string, values?: Record<string, unknown>) =>
    translateCopy(source, "en", values);
  assert.equal(
    tagErrorMessage(new TagValueError("duplicate", "unused"), english),
    "This tag has already been added",
  );
  assert.notEqual(translateCopy("Теги", "en"), "Теги");
  assert.ok(copyTranslationKey("Теги").startsWith("copy."));
  const values = ["Крафт", "Heinz"];
  assert.deepEqual(parseTags(values), values);
});

test("tag rendering safely escapes values, compacts table chips and preserves invalid JSON", () => {
  const tags = ["<script>alert(1)</script>", "Kraft", "Heinz", "Крафт"];
  const compact = renderToStaticMarkup(
    createElement(TagsValue, { value: tags, limit: 3 }),
  );
  assert.ok(!compact.includes("<script>"));
  assert.ok(compact.includes("&lt;script&gt;"));
  assert.ok(compact.includes("+1"));
  assert.ok(compact.includes("Ещё тегов: 1"));
  const full = renderToStaticMarkup(createElement(TagsValue, { value: tags }));
  assert.ok(full.includes("Крафт"));
  assert.ok(!full.includes("+1"));
  const editor = renderToStaticMarkup(
    createElement(TagsInput, {
      id: "tags-test",
      value: JSON.stringify(tags),
      label: "Теги",
      disabled: false,
      onChange() {},
    }),
  );
  assert.ok(editor.includes("Удалить тег Kraft"));
  assert.ok(!editor.includes("textarea"));
  const legacy = renderToStaticMarkup(
    createElement(TagsInput, {
      id: "tags-test",
      value: '["keep",2]',
      label: "Теги",
      disabled: false,
      onChange() {},
    }),
  );
  assert.ok(legacy.includes("textarea"));
  assert.ok(legacy.includes("[&quot;keep&quot;,2]"));
  assert.ok(legacy.includes("Исходное значение"));
});
