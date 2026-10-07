import assert from "node:assert/strict";
import test from "node:test";
import {
  draftChanges,
  serializeDraft,
  upsertRecord,
  withFormValues,
  withRecordSnapshot,
  type RecordDraft,
} from "../src/components/items/record-draft-model";

test("wire draft preserves nested junction changes but excludes UI data", () => {
  const draft: RecordDraft = {
    id: "1",
    values: { title: "Changed" },
    label: "Preview",
    preview: { title: "Preview" },
    references: {
      category: { key: "draft:new", values: { title: "New" }, label: "New" },
    },
    relations: {
      tags: {
        removedLabels: { "3": "Private UI label" },
        detach: ["3"],
        attach: [
          {
            id: "2",
            label: "Tag",
            preview: { title: "Tag" },
            record: {
              values: { note: "Note" },
              references: {
                author: { id: "8", values: { name: "Edited author" } },
              },
            },
          },
        ],
        create: [
          {
            key: "draft:tag",
            record: { key: "draft:tag", values: { title: "Tag" } },
            link: { values: { note: "Link" } },
          },
        ],
      },
    },
    records: [
      {
        collection: "categories",
        record: { id: "4", values: { title: "Updated" } },
      },
    ],
  };
  const wire = JSON.parse(JSON.stringify(serializeDraft(draft)));
  assert.equal(
    wire.relations.tags.attach[0].record.references.author.values.name,
    "Edited author",
  );
  assert.equal(wire.relations.tags.create[0].link.values.note, "Link");
  assert.deepEqual(wire.relations.tags.detach, ["3"]);
  assert.ok(!JSON.stringify(wire).includes("Preview"));
  assert.ok(!JSON.stringify(wire).includes("draft:"));
  assert.equal(draftChanges(draft), 6);
});

test("accepted record snapshots advance the conflict baseline without losing an initial draft", () => {
  const initial: RecordDraft = {
    id: "1",
    values: {},
    baseValues: { title: "A" },
  };
  const refreshed = withRecordSnapshot(initial, { title: "B" }, false);
  assert.deepEqual(refreshed.baseValues, { title: "B" });
  assert.deepEqual(
    serializeDraft(withFormValues(refreshed, { title: "C" })).expectedValues,
    { title: "B" },
  );
  assert.deepEqual(
    withRecordSnapshot(initial, { title: "B" }, true).baseValues,
    { title: "A" },
  );
});

test("changing reference discards its draft; reverting related edits removes pending work", () => {
  const draft: RecordDraft = {
    id: "1",
    values: {},
    references: { category: { id: "2", values: { title: "Edit" } } },
  };
  assert.deepEqual(withFormValues(draft, { category: "3" }).references, {});
  assert.equal(
    withFormValues(draft, { category: "2" }).references?.category.values.title,
    "Edit",
  );
  const edited = upsertRecord({ values: {} }, "tags", {
    id: "2",
    values: { title: "Edit" },
  });
  assert.equal(draftChanges(edited), 1);
  const reverted = upsertRecord(edited, "tags", { id: "2", values: {} });
  assert.equal(draftChanges(reverted), 0);
});
