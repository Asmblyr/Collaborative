import assert from "node:assert/strict";
import test from "node:test";
import { parseAggregateInput } from "../src/tools/aggregate-input.js";
import { captureAggregateSelections } from "../src/assistant/aggregate-selections.js";

const input = {
  q: null,
  filter: null,
  terms: null,
  groupBy: [],
  metrics: [{ operation: "count", field: null }],
  orderBy: null,
  page: 1,
  limit: 5,
};

test("aggregate input rejects SQL expressions, unsupported shape and ambiguous ordering", () => {
  assert.equal(parseAggregateInput(input).query.q, "");
  for (const override of [
    { groupBy: ["author.title"] },
    { groupBy: ["title", "title"] },
    { groupBy: ["count(*)"] },
    { metrics: [{ operation: "sum", field: null }] },
    { metrics: [{ operation: "count", field: "*" }] },
    { metrics: [{ operation: "pg_sleep", field: "title" }] },
    { metrics: [] },
    { metrics: [{ operation: "count", field: null, sql: "1" }] },
    { metrics: Array(6).fill(input.metrics[0]) },
    { page: 2 },
    { limit: 21 },
    { page: 1.5 },
    { orderBy: { metric: 1, direction: "asc" } },
    { orderBy: { metric: 0, direction: "random" } },
    { userId: "someone" },
  ])
    assert.throws(() => parseAggregateInput({ ...input, ...override }));
});

test("group selections preserve OR, NULL and empty keys, refuse previews and non-selectable groups", () => {
  const base = {
    collection: "posts",
    collectionId: "id",
    displayName: "Posts",
    sort: "id",
    direction: "asc",
    conditions: {
      q: "search",
      filter: {
        logic: "or",
        children: [
          { field: "a", op: "eq", value: "1" },
          { field: "b", op: "eq", value: "2" },
        ],
      },
    },
  };
  const result = captureAggregateSelections({
    ...base,
    groups: [
      { values: { title: null }, count: "3", truncatedFields: [], selectable: true },
      { values: { title: "" }, count: "2", truncatedFields: [], selectable: true },
      { values: { title: "preview" }, count: "1", truncatedFields: ["title"], selectable: false },
    ],
  });
  assert.equal(result.selections.length, 2);
  assert.deepEqual(result.selections[0].filter, {
    logic: "and",
    children: [base.conditions.filter, { field: "title", op: "isNull" }],
  });
  assert.deepEqual(result.selections[1].filter, {
    logic: "and",
    children: [base.conditions.filter, { field: "title", op: "eq", value: "" }],
  });
  assert.equal(result.selections[0].q, "search");
  const unselectable = captureAggregateSelections({
    ...base,
    conditions: {
      q: "",
      filter: { logic: "and", children: Array(20).fill({ field: "a", op: "eq", value: "1" }) },
    },
    groups: [{ values: { title: "value" }, count: "1", truncatedFields: [], selectable: false }],
  });
  assert.equal(unselectable.selections.length, 0);
});
