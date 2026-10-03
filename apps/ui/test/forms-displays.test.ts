import assert from "node:assert/strict";
import test from "node:test";
import { conditionMatches, effectiveLayout, fieldsInNodes, visibleLayout } from "../src/components/items/form-layout-model";
import { formatExactNumber, formattedValue } from "../src/components/items/value-format";
import { templateLabel } from "../src/components/items/item-label";
import { appendFormNode, removeFormNode, reorderFormNode } from "../src/components/collections/form-designer-model";
import type { FormLayout, FormNode } from "../src/components/items/presentation-types";
import type { CollectionField } from "../src/components/items/types";

const node = (field: string): FormNode => ({ id: field, kind: "field", field, width: "full" });
const layout: FormLayout = { version: 1, tabs: [{ id: "main", label: "Main", children: [node("title")] },
  { id: "details", label: "Details", children: [{ id: "group", kind: "group", label: "Details", description: "", collapsible: true, collapsed: true,
    when: { mode: "all", rules: [{ field: "title", operator: "eq", value: "show" }] }, children: [node("note")] }] }] };
const fields: CollectionField[] = ["title", "note", "new"].map((name) => ({ name, type: "text", required: false, nullable: true }));

test("layout keeps new fields reachable, filters unavailable fields and preserves condition dependencies", () => {
  const resolved = effectiveLayout(layout, fields);
  assert.equal(resolved.tabs[2].label, "Другие поля");
  assert.deepEqual(resolved.tabs.flatMap((t) => fieldsInNodes(t.children)), ["title", "note", "new"]);
  const limited = effectiveLayout(layout, fields.filter((f) => f.name !== "title"));
  assert.ok(!limited.tabs.flatMap((t) => fieldsInNodes(t.children)).includes("title"));
  assert.ok(conditionMatches(layout.tabs[1].children[0].when, { note: "" }));
  const hidden = visibleLayout(resolved, { title: "hide", note: "kept", new: "" }, new Set());
  assert.deepEqual(hidden.tabs.map((t) => t.id), ["main", "$other"]);
  const forced = visibleLayout(resolved, { title: "hide", note: "", new: "" }, new Set(["note"]));
  assert.ok(forced.tabs.some((t) => t.id === "details"));
});

test("conditions distinguish false, zero and empty; any/all remain predictable", () => {
  const rules = [{ field: "enabled", operator: "eq" as const, value: false }, { field: "count", operator: "eq" as const, value: 0 }];
  assert.ok(conditionMatches({ mode: "all", rules }, { enabled: "false", count: "0" }));
  assert.ok(!conditionMatches({ mode: "all", rules }, { enabled: "true", count: "0" }));
  assert.ok(conditionMatches({ mode: "any", rules }, { enabled: "true", count: "0" }));
  assert.ok(!conditionMatches({ mode: "all", rules: [{ field: "x", operator: "empty" }] }, { x: "0" }));
});

test("moving fields and removing sections keep every field exactly once without mutating the input", () => {
  const moved = appendFormNode(removeFormNode(layout, "title"), "group", node("title"));
  assert.deepEqual(fieldsInNodes(moved.tabs[1].children), ["note", "title"]);
  const ordered = reorderFormNode(moved, "title", -1);
  assert.deepEqual(fieldsInNodes(ordered.tabs[1].children), ["title", "note"]);
  const flattened = removeFormNode(ordered, "group", true);
  assert.deepEqual(flattened.tabs[1].children, [node("title"), node("note")]);
  assert.deepEqual(fieldsInNodes(layout.tabs[0].children), ["title"]);
});

test("number formatting never loses PostgreSQL decimal precision and date timezone is explicit", () => {
  assert.equal(formatExactNumber("9007199254740993.995", 2, true), "9\u00a0007\u00a0199\u00a0254\u00a0740\u00a0994,00");
  assert.equal(formatExactNumber("-0.005", 2, false), "-0,01");
  assert.equal(formatExactNumber("-0.004", 2, false), "0,00");
  assert.equal(formatExactNumber("1.00000000000000000001", 20, false), "1,00000000000000000001");
  assert.equal(formattedValue("2026-09-30T12:30:00Z", { kind: "date", format: "time", timeZone: "Asia/Yekaterinburg" }), "17:30");
});

test("composite labels fail closed on a missing field and preserve boolean/zero values", () => {
  assert.equal(templateLabel("{{title}} / {{private}}", { title: "Public" }), null);
  assert.equal(templateLabel("{{title}} / {{code}}", { title: "<script>alert(1)</script>", code: 0 }), "<script>alert(1)</script> / 0");
  assert.equal(templateLabel("{{enabled}}", { enabled: false }), "false");
  assert.equal(templateLabel("prefix {{title}}", { title: null }), null);
});
