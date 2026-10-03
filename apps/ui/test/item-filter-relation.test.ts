import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFilter } from "../src/components/items/item-filter-model";
import { filterScopes, type FilterScope } from "../src/components/items/item-filter-options";
import { changeRelationSelectionOperator, relationSelectionCondition, relationSelectionOperator,
  relationSelectionScope } from "../src/components/items/item-filter-relation";
import type { Collection } from "../src/components/items/types";

const root: FilterScope = { id: "$root", collection: "articles", fields: [
  { name: "author", label: "author", type: "key", keyType: "serial", nullable: true },
] };
const many: FilterScope = { id: "tags", collection: "tags", kind: "m2m", presenceField: "tags.id", fields: [
  { name: "tags.id", label: "tags ID", type: "key", keyType: "serial", nullable: false, relationKind: "m2m" },
] };

test("negative relation selection excludes any selected related record via none + in", () => {
  for (const kind of ["o2m", "m2m"] as const) {
    const scope = { ...many, kind, fields: many.fields.map((field) => ({ ...field, relationKind: kind })) };
    const start = { ...relationSelectionCondition(scope), value: ["1", "2"] };
    const negative = changeRelationSelectionOperator(start, scope, "notIn");
    assert.deepEqual(negative, { field: "tags.id", op: "in", value: ["1", "2"], quantifier: "none" });
    assert.deepEqual(normalizeFilter({ logic: "and", children: [negative] }, [root, scope]).children, [negative]);
    assert.equal(relationSelectionOperator(negative, scope), "notIn");
    assert.equal(relationSelectionScope([root, scope], negative), scope);
    const single = changeRelationSelectionOperator(negative, scope, "neq");
    assert.deepEqual(single, { field: "tags.id", op: "eq", value: "1", quantifier: "none" });
    const exists = changeRelationSelectionOperator(single, scope, "notExists");
    assert.deepEqual(exists, { field: "tags.id", op: "notExists" });
    assert.deepEqual(changeRelationSelectionOperator(exists, scope, "in"),
      { field: "tags.id", op: "in", value: [], quantifier: "some" });
    // Legacy "some related ID is not in the set" must keep its distinct semantics.
    assert.equal(relationSelectionScope([root, scope], { field: "tags.id", op: "notIn", value: ["1"] }), undefined);
  }
});

test("M2O preserves direct nullable foreign-key filtering and scalar/list conversion", () => {
  const scope: FilterScope = { id: "author", collection: "users", kind: "m2o", fields: [], presenceField: "author.id" };
  const start = { ...relationSelectionCondition(scope), value: "42" };
  assert.deepEqual(start, { field: "author", op: "eq", value: "42" });
  const list = changeRelationSelectionOperator(start, scope, "notIn");
  assert.deepEqual(list, { field: "author", op: "notIn", value: ["42"] });
  assert.deepEqual(normalizeFilter({ logic: "and", children: [list] }, [root, scope]).children, [list]);
  const empty = changeRelationSelectionOperator(list, scope, "isNull");
  assert.deepEqual(normalizeFilter({ logic: "and", children: [empty] }, [root, scope]).children,
    [{ field: "author", op: "isNull" }]);
});

test("record selection is only available for relations with readable targets", () => {
  const collection: Collection = { name: "articles", folderId: null, mode: "multiple",
    primaryKey: { name: "id", type: "serial" }, timestamps: { createdAt: false, updatedAt: false },
    access: { read: ["*"], create: null, update: null, delete: false, structure: false },
    fields: [{ name: "author", type: "relation", nullable: true, required: false,
      relation: { kind: "m2o", collection: "users", primaryKey: { name: "id", type: "serial" }, onDelete: "setNull" } }] };
  const users: Collection = { ...collection, name: "users", fields: [], access: { ...collection.access, read: null } };
  const condition = { field: "author", op: "eq", value: "42" };
  assert.equal(relationSelectionScope(filterScopes(collection, [collection, users]), condition), undefined);
  const readable = { ...users, access: { ...users.access, read: ["id"] } };
  assert.equal(relationSelectionScope(filterScopes(collection, [collection, readable]), condition)?.collection, "users");
});
