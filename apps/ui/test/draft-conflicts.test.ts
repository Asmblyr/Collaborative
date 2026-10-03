import assert from "node:assert/strict";
import test from "node:test";
import {
  draftTargets,
  findDraftConflicts,
  rebaseDraft,
  type DraftSnapshot,
} from "../src/components/items/draft-conflicts";
import {
  serializeDraft,
  draftChanges,
  type RecordDraft,
} from "../src/components/items/record-draft-model";
import type { Item } from "../src/components/items/types";

test("preconditions include only changed fields and foreign keys, including nested records", () => {
  const draft: RecordDraft = {
    id: "1",
    collection: "articles",
    values: { title: "Mine" },
    baseValues: { id: 1, title: "Before", unused: "Never send", category: "2" },
    references: {
      category: {
        id: "2",
        collection: "categories",
        values: { name: "Mine" },
        baseValues: { name: "Before" },
      },
    },
  };
  const wire = serializeDraft(draft);
  assert.deepEqual(wire.expectedValues, { title: "Before", category: "2" });
  assert.deepEqual(wire.references?.category.expectedValues, {
    name: "Before",
  });
  assert.ok(!JSON.stringify(wire).includes("Never send"));
  assert.ok(!Object.hasOwn(wire, "collection"));
});

test("rebasing preserves other edits and relation operations while resolving root and nested conflicts", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { title: "Mine", note: "Other edit" },
    baseValues: { title: "Before", note: "Before" },
    records: [
      {
        collection: "tags",
        record: {
          id: "2",
          collection: "tags",
          values: { name: "My tag" },
          baseValues: { name: "Before" },
        },
      },
    ],
    relations: { tags: { detach: ["9"] } },
  };
  const targets = draftTargets("articles", draft);
  const snapshots = targets.map<DraftSnapshot>((target) => {
    let current: Item;
    if (target.path === "root") {
      current = { title: "Colleague", note: "Before" };
    } else {
      current = { name: "Their tag" };
    }
    return { ...target, current };
  });
  const conflicts = findDraftConflicts(snapshots);
  assert.deepEqual(
    conflicts.map((conflict) => conflict.field),
    ["title", "name"],
  );
  const next = rebaseDraft("articles", draft, snapshots, {
    [conflicts[0].key]: "current",
    [conflicts[1].key]: "mine",
  });
  assert.deepEqual(next.values, { note: "Other edit" });
  assert.deepEqual(next.baseValues, { title: "Colleague", note: "Before" });
  assert.equal(next.records?.[0].record.values.name, "My tag");
  assert.equal(next.records?.[0].record.baseValues?.name, "Their tag");
  assert.deepEqual(next.relations?.tags.detach, ["9"]);
  assert.equal(draft.values.title, "Mine");
});

test("structured object key order and already applied edits do not cause conflicts", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { title: "Mine", details: { a: 3 } },
    baseValues: { title: "Before", details: { a: 1, b: [2] } },
  };
  const snapshots = [
    {
      ...draftTargets("articles", draft)[0],
      current: { title: "Mine", details: { b: [2], a: 1 } },
    },
  ];
  assert.deepEqual(findDraftConflicts(snapshots), []);
  assert.deepEqual(rebaseDraft("articles", draft, snapshots, {}).values, {
    details: { a: 3 },
  });
});

test("taking the current reference discards the outdated assignment and its nested draft", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { category: "draft:new" },
    baseValues: { category: "2" },
    references: { category: { key: "draft:new", values: { name: "New" } } },
  };
  const snapshots = [
    { ...draftTargets("articles", draft)[0], current: { category: "3" } },
  ];
  const conflicts = findDraftConflicts(snapshots);
  assert.equal(conflicts.length, 1);
  const next = rebaseDraft("articles", draft, snapshots, {
    [conflicts[0].key]: "current",
  });
  assert.deepEqual(next.values, {});
  assert.deepEqual(next.references, {});
});

test("a field hidden after opening cannot be silently rebased", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { secret: "Mine" },
    baseValues: { secret: "Before" },
  };
  assert.throws(
    () =>
      findDraftConflicts([
        { ...draftTargets("articles", draft)[0], current: { id: 1 } },
      ]),
    /Доступ/,
  );
});

test("rebasing requires explicit choices and keeps the original draft on failure", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { title: "Mine" },
    baseValues: { title: "Before" },
  };
  const snapshots = [
    { ...draftTargets("articles", draft)[0], current: { title: "Colleague" } },
  ];
  assert.throws(
    () => rebaseDraft("articles", draft, snapshots, {}),
    /Выберите/,
  );
  assert.equal(draft.baseValues?.title, "Before");
  assert.equal(draft.values.title, "Mine");
});

test("accepting a nested current value refreshes its preview without a phantom write", () => {
  const draft: RecordDraft = {
    id: "1",
    values: {},
    baseValues: { id: "1" },
    records: [
      {
        collection: "tags",
        record: {
          id: "2",
          values: { name: "Mine" },
          baseValues: { name: "Before" },
          preview: { id: "2", name: "Mine" },
          label: "Mine",
        },
      },
    ],
  };
  const snapshots = draftTargets("articles", draft).map<DraftSnapshot>(
    (target) => {
      let current: Item;
      if (target.path === "root") {
        current = { id: "1" };
      } else {
        current = { id: "2", name: "Colleague" };
      }
      return { ...target, current };
    },
  );
  const conflict = findDraftConflicts(snapshots)[0];
  const next = rebaseDraft(
    "articles",
    draft,
    snapshots,
    { [conflict.key]: "current" },
    (_name, preview) => String(preview.name ?? preview.id),
  );
  assert.equal(next.records?.[0].record.preview?.name, "Colleague");
  assert.equal(next.records?.[0].record.label, "Colleague");
  assert.equal(draftChanges(next), 0);
  assert.deepEqual(serializeDraft(next).records, []);
});

test("clean reference and junction previews do not cause phantom writes", () => {
  const clean: RecordDraft = {
    id: "2",
    values: {},
    baseValues: { name: "Current" },
    preview: { name: "Current" },
  };
  const draft: RecordDraft = {
    id: "1",
    values: {},
    baseValues: { category: "2" },
    references: { category: clean },
    relations: {
      tags: { links: [{ id: "2", record: clean }], attach: [{ id: "3" }] },
    },
  };
  assert.equal(draftChanges(draft), 1);
  const wire = serializeDraft(draft);
  assert.deepEqual(wire.references, {});
  assert.deepEqual(wire.expectedValues, {});
  assert.deepEqual(wire.relations?.tags.links, []);
  assert.deepEqual(wire.relations?.tags.attach, [{ id: "3" }]);
});
