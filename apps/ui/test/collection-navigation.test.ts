import assert from "node:assert/strict";
import test from "node:test";
import { collectionNavigationEntries } from "../src/lib/collection-navigation";
import type { Collection } from "../src/components/items/types";

test("all shell pages preserve collection visibility, hierarchy and read access", () => {
  const base: Collection = {
    name: "departments",
    displayName: "Departments",
    hidden: false,
    folderId: "folder",
    parentCollection: "company",
    translations: { ru: { label: "Департаменты" } },
    mode: "multiple",
    primaryKey: { name: "id", type: "serial" },
    timestamps: { createdAt: false, updatedAt: false },
    fields: [],
    access: {
      read: ["*"],
      create: null,
      update: null,
      delete: false,
      structure: false,
    },
  };
  const navigation = collectionNavigationEntries([
    base,
    { ...base, name: "hidden", hidden: true },
    {
      ...base,
      name: "write_only",
      access: { ...base.access, read: null, update: ["title"] },
    },
    { ...base, name: "denied", access: { ...base.access, read: null } },
  ]);
  assert.deepEqual(
    navigation.map(({ name }) => name),
    ["departments", "hidden", "write_only"],
  );
  assert.deepEqual(
    navigation.filter((entry) => !entry.hidden).map(({ name }) => name),
    ["departments", "write_only"],
  );
  assert.equal(navigation[2].readable, false);
  assert.equal(navigation[0].parentCollection, "company");
  assert.equal(navigation[0].folderId, "folder");
  assert.deepEqual(navigation[0].translations, base.translations);
});
