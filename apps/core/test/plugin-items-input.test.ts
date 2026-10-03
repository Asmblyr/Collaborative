import assert from "node:assert/strict";
import test from "node:test";
import { pluginListQuery } from "../src/plugins/items-input.js";

test("non-JSON filters fail as client errors, before reaching the database", () => {
  const cyclic: { logic: string; children: unknown[] } = { logic: "and", children: [] };
  cyclic.children.push(cyclic);
  for (const filter of [cyclic, { logic: "and", children: [], value: 1n }]) {
    assert.throws(() => pluginListQuery({ filter }), { statusCode: 400 });
  }
});
