import assert from "node:assert/strict";
import test from "node:test";
import { tableRelationRequests } from "../src/components/items/table-relation-requests";
import type { Collection } from "../src/components/items/types";
import type { ItemColumn } from "../src/components/items/use-item-columns";

const target: Collection = { name: "people", folderId: null, mode: "multiple", displayField: "name",
  primaryKey: { name: "key", type: "text" }, timestamps: { createdAt: false, updatedAt: false },
  fields: [{ name: "name", type: "text", nullable: false, required: true }],
  access: { read: ["name"], create: null, update: null, delete: false, structure: false } };
const relation = { kind: "m2o" as const, collection: "people", primaryKey: target.primaryKey, onDelete: "restrict" as const };
const columns: ItemColumn[] = [{ name: "author", label: "Автор", type: "relation", relation },
  { name: "editor", label: "Редактор", type: "relation", relation }];

test("table labels share a batch across relation columns and preserve zero keys", () => {
  const requests = tableRelationRequests([target], [
    { author: "alice", editor: "bob" }, { author: "alice", editor: 0 }, { author: null, editor: "bob" },
  ], columns);
  assert.deepEqual(requests, [{ collection: "people", key: "key", label: "name", ids: ["alice", "bob", "0"] }]);
});

test("table labels only request visible relations with readable targets", () => {
  assert.deepEqual(tableRelationRequests([{ ...target, access: { ...target.access, read: null } }],
    [{ author: "alice" }], columns), []);
  assert.deepEqual(tableRelationRequests([target], [{ author: "alice" }], []), []);
  assert.deepEqual(tableRelationRequests([target], [{ author: null }], columns), []);
});

test("a restricted display field falls back to the key without requesting its value", () => {
  const requests = tableRelationRequests([{ ...target, access: { ...target.access, read: ["key"] } }],
    [{ author: "alice" }], columns);
  assert.equal(requests[0].label, "key");
});
