import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { parseTermIds, parseTermInput } from "../src/terms/validation.js";

test("term definitions allow descriptive paragraphs and reject ambiguity, oversized input and executable fields", () => {
  const input = {
    name: "Активные",
    description: "Рабочие записи.\nУсловие зависит от коллекции.",
    aliases: ["действующие"],
    enabled: true,
  };
  assert.deepEqual(parseTermInput(input), input);
  for (const invalid of [
    { ...input, aliases: ["АКТИВНЫЕ"] },
    { ...input, aliases: ["a", "A"] },
    { ...input, aliases: Array(13).fill("a") },
    { ...input, description: "" },
    { ...input, description: "x".repeat(1001) },
    { ...input, description: "bad\u0000value" },
    { ...input, builtin: true },
    { ...input, sql: "select * from secret" },
  ])
    assert.throws(() => parseTermInput(invalid));
});

test("term references are bounded unique IDs and cannot carry inline conditions", () => {
  const id = randomUUID();
  assert.deepEqual(parseTermIds([id.toUpperCase()]), [id]);
  assert.deepEqual(parseTermIds(null), []);
  for (const input of [
    [id, id],
    ["active"],
    Array.from({ length: 6 }, () => randomUUID()),
    [{ id, filter: {} }],
  ]) {
    assert.throws(() => parseTermIds(input));
  }
});
