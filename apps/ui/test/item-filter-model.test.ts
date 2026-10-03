import assert from "node:assert/strict";
import test from "node:test";
import { changeFilterOperator, normalizeFilter, addFilterNode, removeFilterNode, replaceFilterNode } from "../src/components/items/item-filter-model";
import type { FilterGroup, FilterScope } from "../src/components/items/item-filter-options";

const scopes: FilterScope[] = [
  { id: "$root", collection: "articles", fields: [
    { name: "title", label: "Title", type: "text", nullable: true },
    { name: "id", label: "ID", type: "key", keyType: "uuid", nullable: false },
    { name: "large_id", label: "Large ID", type: "key", keyType: "bigserial", nullable: false },
    { name: "count", label: "Count", type: "integer", nullable: false },
    { name: "created_at", label: "Created", type: "datetime", nullable: false },
  ] },
  { id: "comments", collection: "comments", kind: "o2m", presenceField: "comments.id", fields: [
    { name: "comments.id", label: "Comments ID", type: "key", keyType: "uuid", nullable: false, relationKind: "o2m" },
    { name: "comments.body", label: "Comments body", type: "text", nullable: true, relationKind: "o2m" },
  ] },
];

test("changing compatible operators preserves the literal value and collection quantifier", () => {
  const original = { field: "comments.body", op: "contains", value: "hello, world", quantifier: "none" as const };
  assert.deepEqual(changeFilterOperator(original, "notContainsCase"), { ...original, op: "notContainsCase" });
  const list = changeFilterOperator(original, "in");
  assert.deepEqual(list.value, ["hello, world"]);
  assert.equal(changeFilterOperator(list, "eq").value, "hello, world");
  assert.deepEqual(changeFilterOperator({ field: "count", op: "gt", value: "100" }, "between").value, ["100", ""]);
  assert.equal(original.op, "contains");
});

test("value-free operators serialize without a value and presence without a quantifier", () => {
  const group: FilterGroup = { logic: "and", children: [
    changeFilterOperator({ field: "comments.body", op: "eq", value: "value", quantifier: "none" }, "isNull"),
    { field: "comments.id", op: "notExists", value: "stale", quantifier: "some" },
  ] };
  assert.deepEqual(normalizeFilter(group, scopes).children, [
    { field: "comments.body", op: "isNull", quantifier: "none" },
    { field: "comments.id", op: "notExists" },
  ]);
});

test("rejects invalid UUIDs, out-of-range integers and missing bounds before applying", () => {
  const normalize = (field: string, value: string | string[], op = "eq") =>
    normalizeFilter({ logic: "and", children: [{ field, op, value }] }, scopes);
  assert.throws(() => normalize("id", "1"), /UUID/);
  assert.throws(() => normalize("count", "2147483648"), /целое число/);
  assert.throws(() => normalize("large_id", "9223372036854775808"), /диапазон/);
  assert.throws(() => normalize("count", ["1", ""], "between"), /обе границы/);
  assert.deepEqual(normalize("large_id", "9223372036854775807").children,
    [{ field: "large_id", op: "eq", value: "9223372036854775807" }]);
});

test("normalizes offset dates and retains comma-containing list values", () => {
  const result = normalizeFilter({ logic: "and", children: [
    { field: "created_at", op: "gte", value: "2026-09-29T10:00:00+05:00" },
    { field: "title", op: "in", value: ["hello, world", "second"] },
  ] }, scopes);
  assert.deepEqual(result.children, [
    { field: "created_at", op: "gte", value: "2026-09-29T05:00:00.000Z" },
    { field: "title", op: "in", value: ["hello, world", "second"] },
  ]);
  assert.throws(() => normalizeFilter({ logic: "and", children: [
    { field: "created_at", op: "eq", value: "not a date" },
  ] }, scopes), /дату/);
});

test("nested tree edits retain group boundaries and do not mutate the starting filter", () => {
  const start: FilterGroup = { logic: "and", children: [
    { field: "title", op: "contains", value: "a" },
    { logic: "or", children: [{ field: "count", op: "eq", value: "1" }] },
  ] };
  const added = addFilterNode(start, [1], { field: "count", op: "eq", value: "2" });
  const replaced = replaceFilterNode(added, [1, 0], { field: "count", op: "eq", value: "3" });
  const removed = removeFilterNode(replaced, [0]);
  assert.deepEqual(removed, { logic: "and", children: [
    { logic: "or", children: [{ field: "count", op: "eq", value: "3" }, { field: "count", op: "eq", value: "2" }] },
  ] });
  assert.deepEqual((start.children[1] as FilterGroup).children, [{ field: "count", op: "eq", value: "1" }]);
  assert.throws(() => normalizeFilter({ logic: "and", children: [{ logic: "or", children: [] }] }, scopes), /пустую группу/);
});

test("catches Core complexity limits and blank text patterns before navigation", () => {
  const condition = { field: "title", op: "contains", value: "text" };
  const group = (children: FilterGroup["children"]): FilterGroup => ({ logic: "and", children });
  assert.throws(() => normalizeFilter(group([{ ...condition, value: "   " }]), scopes), /введите значение/);
  assert.throws(() => normalizeFilter(group([group([group([group([condition])])])]), scopes), /3 уровней/);
  assert.throws(() => normalizeFilter(group([group(Array(11).fill(condition)),
    group(Array(10).fill(condition))]), scopes), /20 условий/);
  assert.throws(() => normalizeFilter(group(Array.from({ length: 15 }, () => group([condition]))), scopes), /много групп/);
  assert.throws(() => normalizeFilter(group(Array.from({ length: 2 }, () => ({
    field: "title", op: "in", value: Array(20).fill("x".repeat(255)),
  }))), scopes), /слишком большой/);
  assert.equal(normalizeFilter(group(Array(20).fill(condition)), scopes).children.length, 20);
});
