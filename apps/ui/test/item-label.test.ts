import assert from "node:assert/strict";
import test from "node:test";
import { recordLabel } from "../src/components/items/item-label";
import { filterScopes } from "../src/components/items/item-filter-options";
import type { Collection } from "../src/components/items/types";

const target: Collection = {
  name: "authors",
  folderId: null,
  mode: "multiple",
  displayField: "number",
  primaryKey: { name: "key", type: "text" },
  timestamps: { createdAt: false, updatedAt: false },
  fields: [
    { name: "title", type: "text", nullable: true, required: false },
    { name: "number", type: "integer", nullable: true, required: false },
  ],
  access: {
    read: ["title", "number"],
    create: null,
    update: null,
    delete: false,
    structure: false,
  },
};

test("configured labels keep zero values, fall back on blank values and never expose hidden fields", () => {
  const item = { key: "__proto__", title: "Title", number: 0 };
  assert.equal(recordLabel(target, item), "0");
  assert.equal(recordLabel(target, { ...item, number: null }), "__proto__");
  assert.equal(
    recordLabel(
      { ...target, access: { ...target.access, read: ["title"] } },
      item,
    ),
    "__proto__",
  );
  assert.equal(recordLabel({ ...target, displayField: null }, item), "Title");
  assert.equal(
    recordLabel({ ...target, displayField: "title" }, { ...item, title: "  " }),
    "__proto__",
  );
});

test("relation filters receive the same permission-aware label field as the editor", () => {
  const source: Collection = {
    ...target,
    name: "posts",
    fields: [
      {
        name: "author",
        type: "relation",
        nullable: true,
        required: false,
        relation: {
          kind: "m2o",
          collection: "authors",
          primaryKey: target.primaryKey,
          onDelete: "setNull",
        },
      },
    ],
    access: { ...target.access, read: ["*"] },
  };
  assert.equal(
    filterScopes(source, [source, target])[1].displayField,
    "number",
  );
  const restricted = {
    ...target,
    access: { ...target.access, read: ["title"] },
  };
  assert.equal(
    filterScopes(source, [source, restricted])[1].displayField,
    "key",
  );
});
