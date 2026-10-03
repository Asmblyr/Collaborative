import assert from "node:assert/strict";
import test from "node:test";
import {
  canNestCollection,
  collectionTree,
  flattenCollections,
} from "../src/lib/collection-tree";

const catalog = [
  { name: "shops", folderId: "folder", parentCollection: null },
  { name: "categories", folderId: null, parentCollection: "shops" },
  { name: "links", folderId: null, parentCollection: "categories" },
  { name: "clients", folderId: null, parentCollection: null },
];

test("nested collections render once in depth order, preserving roots and folder placement", () => {
  const tree = collectionTree(catalog);
  assert.deepEqual(
    tree.map((n) => n.collection.name),
    ["shops", "clients"],
  );
  assert.equal(tree[0].collection.folderId, "folder");
  assert.deepEqual(
    flattenCollections(tree).map((c) => [c.collection.name, c.depth]),
    [
      ["shops", 0],
      ["categories", 1],
      ["links", 2],
      ["clients", 0],
    ],
  );
  assert.equal(canNestCollection("shops", "links", catalog), false);
  assert.equal(canNestCollection("shops", "shops", catalog), false);
  assert.equal(canNestCollection("links", "clients", catalog), true);
});

test("hidden, inaccessible or out-of-workspace parents leave visible descendants reachable", () => {
  const visible = catalog.filter((c) => c.name !== "shops");
  assert.deepEqual(
    collectionTree(visible).map((n) => n.collection.name),
    ["categories", "clients"],
  );
  assert.deepEqual(
    flattenCollections(collectionTree(visible)).map((c) => c.collection.name),
    ["categories", "links", "clients"],
  );
});

test("a malformed imported cycle cannot hide collections or recurse forever", () => {
  const broken = [
    { name: "a", folderId: null, parentCollection: "b" },
    { name: "b", folderId: null, parentCollection: "a" },
  ];
  assert.deepEqual(
    flattenCollections(collectionTree(broken)).map((c) => c.collection.name),
    ["a", "b"],
  );
});
