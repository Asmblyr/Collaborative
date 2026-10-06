import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultPresentation } from "../src/components/collections/field-presentation-defaults";
import { fieldChoicePayload } from "../src/components/collections/field-choice-values";
import { defaultPayload } from "../src/components/collections/field-default-value";
import {
  inputValue,
  payloadValue,
} from "../src/components/items/item-input-values";
import { displayValue } from "../src/components/items/item-display";
import { normalizeFilter } from "../src/components/items/item-filter-model";
import {
  fieldOperators,
  type FilterField,
} from "../src/components/items/item-filter-options";
import { UrlFieldInput } from "../src/components/items/url-field-input";
import { ContentValue } from "../src/components/items/content-value";
import { ItemFormActions } from "../src/components/items/item-form-actions";
import { conditionIsValid } from "../src/components/access/policy-condition-model";
import type { CollectionField } from "../src/components/items/types";

const field = (type: string): CollectionField => ({
  name: "value",
  type,
  nullable: true,
  required: false,
});

test("integer-choice drafts normalize values and preserve zero/default while rejecting duplicates", () => {
  const presentation = {
    ...defaultPresentation,
    interface: "select" as const,
    options: [
      { value: "0", label: "Zero" },
      { value: "-1", label: "Negative" },
    ],
  };
  assert.deepEqual(fieldChoicePayload(presentation, "integer").options, [
    { value: 0, label: "Zero" },
    { value: -1, label: "Negative" },
  ]);
  assert.equal(payloadValue(field("integer"), "0"), 0);
  assert.equal(defaultPayload("integer", "0"), 0);
  const displayed = renderToStaticMarkup(
    createElement(ContentValue, {
      field: {
        type: "integer",
        presentation: fieldChoicePayload(presentation, "integer"),
      },
      value: 0,
    }),
  );
  assert.match(displayed, />Zero</);
  assert.throws(() =>
    fieldChoicePayload(
      {
        ...presentation,
        options: [
          { value: "0", label: "A" },
          { value: 0, label: "B" },
        ],
      },
      "integer",
    ),
  );
  for (const value of ["", "1.2", "2147483648"]) {
    assert.throws(() =>
      fieldChoicePayload(
        { ...presentation, options: [{ value, label: "Bad" }] },
        "integer",
      ),
    );
  }
  assert.equal(fieldChoicePayload(presentation, "text").options![0].value, "0");
});

test("date and bigint drafts, defaults, display and filters preserve their string contract", () => {
  const day = "2026-10-04",
    counter = "9007199254740993";
  for (const [type, value] of [
    ["date", day],
    ["bigint", counter],
  ]) {
    assert.equal(inputValue(field(type), { value }), value);
    assert.equal(payloadValue(field(type), value), value);
    assert.equal(defaultPayload(type, value), value);
    assert.equal(payloadValue(field(type), ""), null);
  }
  assert.equal(displayValue(day, "date"), "04.10.2026");
  assert.equal(displayValue(counter, "bigint"), counter);
  const actions = renderToStaticMarkup(
    createElement(ItemFormActions, {
      fields: [field("date"), field("bigint")],
      pending: false,
      creating: true,
    }),
  );
  assert.doesNotMatch(actions, /disabled=/);
  const fields: FilterField[] = [
    { name: "day", label: "Day", type: "date", nullable: true },
    { name: "counter", label: "Counter", type: "bigint", nullable: true },
  ];
  assert.ok(fieldOperators(fields[0]).includes("between"));
  assert.ok(fieldOperators(fields[1]).includes("gte"));
  const filter = {
    logic: "and" as const,
    children: [
      { field: "day", op: "eq", value: day },
      { field: "counter", op: "gt", value: counter },
    ],
  };
  assert.deepEqual(
    normalizeFilter(filter, [{ id: "root", collection: "entries", fields }]),
    filter,
  );
  const permission = {
    logic: "and" as const,
    children: [
      {
        field: "day",
        op: "eq" as const,
        value: { kind: "literal" as const, value: day },
      },
      {
        field: "counter",
        op: "gt" as const,
        value: { kind: "literal" as const, value: counter },
      },
    ],
  };
  assert.ok(conditionIsValid(permission, fields));
  assert.equal(
    conditionIsValid(
      {
        ...permission,
        children: [
          {
            field: "counter",
            op: "gt",
            value: { kind: "literal", value: "9223372036854775808" },
          },
        ],
      },
      fields,
    ),
    false,
  );
  assert.throws(() => payloadValue(field("date"), "2026-02-29"));
  assert.throws(() => defaultPayload("bigint", "9223372036854775808"));
  assert.throws(() =>
    normalizeFilter(
      {
        ...filter,
        children: [{ field: "day", op: "eq", value: "2026-04-31" }],
      },
      [{ id: "root", collection: "entries", fields }],
    ),
  );
});

test("URL editor keeps compact controls and only opens absolute HTTP(S) without credentials", () => {
  const render = (value: string, disabled = false) =>
    renderToStaticMarkup(
      createElement(UrlFieldInput, {
        id: "url",
        value,
        disabled,
        onChange() {},
      }),
    );
  assert.match(
    render("https://example.test/page", true),
    /href="https:\/\/example.test\/page"/,
  );
  assert.match(
    render("https://example.test/page"),
    /rel="noopener noreferrer"/,
  );
  for (const value of [
    "",
    "/relative",
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:secret@example.test",
    "https://example.test/a b",
  ]) {
    assert.doesNotMatch(render(value), /href=/);
  }
});
