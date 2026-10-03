import assert from "node:assert/strict";
import test from "node:test";
import { saveEditorDraft } from "../src/lib/item-write";
import { serializeDraft, type RecordDraft } from "../src/components/items/record-draft-model";

test("new and existing editor records save through one SDK commit with their relations", async (t) => {
  const requests: { url: string; body: unknown }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.signal, undefined);
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json({ data: { id: "saved" } });
  });
  const draft: RecordDraft = {
    id: "4",
    values: { title: "Article" },
    preview: { title: "UI only" },
    label: "Preview",
    references: {
      category_id: { key: "draft:category", values: { title: "Category" }, label: "Category" },
    },
    relations: {
      tags: {
        attach: [
          { id: "1", label: "Label", preview: { id: 1 }, record: { values: { note: "Link" } } },
        ],
      },
    },
  };
  assert.equal(await saveEditorDraft("articles", serializeDraft(draft)), "saved");
  assert.equal(
    await saveEditorDraft("articles", serializeDraft({ values: { title: "New" } })),
    "saved",
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, "/api/items/articles/commit");
  assert.deepEqual(requests[0].body, {
    id: "4",
    values: { title: "Article" },
    references: { category_id: { values: { title: "Category" }, references: {}, relations: {} } },
    relations: {
      tags: {
        attach: [{ id: "1", record: { values: { note: "Link" }, references: {}, relations: {} } }],
      },
    },
  });
});

test("a relation conflict stays actionable and the editor draft is not changed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(
      { code: "RELATION_PARENT_CONFLICT", message: "Already linked" },
      { status: 409 },
    );
  });
  const draft = { id: "1", values: { title: "Unsaved" } };
  await assert.rejects(saveEditorDraft("articles", draft), /Изменения не сохранены/);
  assert.deepEqual(draft, { id: "1", values: { title: "Unsaved" } });
  assert.equal(calls, 1);
});
