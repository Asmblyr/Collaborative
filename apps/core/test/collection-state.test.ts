import assert from "node:assert/strict";
import test from "node:test";
import { defaultCollectionState } from "@asmblyr/contracts";
import { parseCollectionState } from "../src/collections/state-validation.js";
import { parseCreateCollection } from "../src/collections/create-validation.js";

test("system state rejects ambiguous or invalid definitions before DDL", () => {
  const state = defaultCollectionState();
  for (const patch of [
    { value: "" },
    { value: "bad code" },
    { label: "" },
    { label: "\0" },
    { label: "x".repeat(101) },
    { color: "pink" },
    { hidden: "yes" },
  ]) {
    assert.throws(
      () => parseCollectionState({ ...state, statuses: [{ ...state.statuses[0], ...patch }] }),
      { statusCode: 400 },
    );
  }
  assert.throws(
    () =>
      parseCreateCollection({ name: "posts", state, fields: [{ name: "status", type: "text" }] }),
    { statusCode: 400 },
  );
  assert.throws(
    () =>
      parseCreateCollection({ name: "posts", state, primaryKey: { name: "status", type: "text" } }),
    { statusCode: 400 },
  );
  assert.deepEqual(parseCollectionState(state), state);
  assert.equal(parseCreateCollection({ name: "posts" }).state, null);
});
