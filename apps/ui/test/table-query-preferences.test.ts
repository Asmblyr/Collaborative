import assert from "node:assert/strict";
import test from "node:test";
import { TablePreferenceWriter } from "../src/components/items/table-preference-writer";
import { tableQueryDefaults } from "../src/lib/table-query-defaults";
import type {
  TablePreferences,
  TableQueryPatch,
} from "../src/lib/table-preferences";
import type { TableView } from "../src/components/items/table-view-dialog";
import { tableQuerySnapshot } from "../src/lib/table-preferences";

test("filter snapshots ignore JSONB object key ordering and retain explicit clears", () => {
  const filter = {
    logic: "and" as const,
    children: [{ field: "title", op: "eq" as const, value: "x" }],
  };
  const reordered = {
    children: [{ value: "x", op: "eq" as const, field: "title" }],
    logic: "and" as const,
  };
  assert.equal(
    tableQuerySnapshot({ filter }),
    tableQuerySnapshot({ filter: reordered }),
  );
  assert.notEqual(tableQuerySnapshot({}), tableQuerySnapshot({ filter: null }));
});

test("rapid table changes coalesce behind an in-flight write and retain latest reset", async () => {
  const sent: TableQueryPatch[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = new TablePreferenceWriter(async (patch) => {
    sent.push(patch);
    if (sent.length === 1) await gate;
  });
  const done = writer.save({ pageSize: 50 });
  void writer.save({ sort: { field: "title", direction: "asc" } });
  void writer.save({ pageSize: 100, filter: { logic: "and", children: [] } });
  void writer.save({
    sort: { field: "title", direction: "desc" },
    filter: null,
  });
  assert.equal(writer.getSnapshot(), "saving");
  release();
  await done;
  assert.deepEqual(sent, [
    { pageSize: 50 },
    {
      sort: { field: "title", direction: "desc" },
      pageSize: 100,
      filter: null,
    },
  ]);
  assert.equal(writer.getSnapshot(), "idle");
});

test("failed autosave preserves changes for retry and independent table writers stay isolated", async () => {
  let offline = true;
  const sent: TableQueryPatch[] = [];
  const writer = new TablePreferenceWriter(async (patch) => {
    if (offline) throw new Error("offline");
    sent.push(patch);
  });
  await writer.save({ pageSize: 50, filter: null });
  assert.equal(writer.getSnapshot(), "error");
  const other = new TablePreferenceWriter(async (patch) => {
    sent.push(patch);
  });
  await other.save({ pageSize: 10 });
  assert.equal(writer.getSnapshot(), "error");
  offline = false;
  await writer.retry();
  assert.deepEqual(sent, [{ pageSize: 10 }, { pageSize: 50, filter: null }]);
  offline = true;
  await writer.save({ pageSize: 25 });
  offline = false;
  await writer.save({ pageSize: 100 });
  assert.deepEqual(sent, [
    { pageSize: 10 },
    { pageSize: 50, filter: null },
    { pageSize: 100 },
  ]);
  assert.equal(writer.getSnapshot(), "idle");
  await writer.retry();
  assert.equal(sent.length, 3);
});

test("table restore respects explicit URLs and cleared personal filters over default views", () => {
  const preferences: TablePreferences = {
    collectionId: "one",
    hasSaved: true,
    columns: null,
    pageSize: 50,
    sort: { field: "title", direction: "desc" },
  };
  const filter = {
    logic: "and" as const,
    children: [{ field: "title", op: "eq" as const, value: "open" }],
  };
  const view: TableView = {
    id: "view",
    name: "Template",
    available: true,
    scope: "personal",
    workspaceId: null,
    isDefault: true,
    editable: true,
    definition: {
      columns: { order: ["title"], hidden: [] },
      sort: { field: "id", direction: "asc" },
      pageSize: 25,
      filter,
      q: "template",
    },
  };
  const defaults = tableQueryDefaults({}, preferences, view, "state-default");
  assert.equal(defaults.filter, JSON.stringify(filter));
  assert.equal(defaults.q, "template");
  assert.equal(new URLSearchParams(defaults.canonical!).get("limit"), "50");
  const cleared = { ...preferences, filter: null };
  assert.equal(
    tableQueryDefaults({}, cleared, view, "state-default").filter,
    "",
  );
  assert.equal(
    tableQueryDefaults({}, cleared, null, "state-default").filter,
    "",
  );
  assert.equal(
    new URLSearchParams(
      tableQueryDefaults({}, cleared, null, "state-default").canonical!,
    ).get("filter"),
    "",
  );
  const saved = { ...preferences, filter };
  assert.equal(
    tableQueryDefaults(
      { filter: "", limit: "10" },
      saved,
      view,
      "state-default",
    ).filter,
    "",
  );
  const linked = tableQueryDefaults(
    { filter: "linked", q: "manual" },
    saved,
    view,
    "state-default",
  );
  assert.equal(linked.filter, "linked");
  assert.equal(linked.q, "manual");
  assert.equal(linked.canonical, null);
  assert.equal(
    tableQueryDefaults({ sort: "title" }, saved, null, "state-default").filter,
    JSON.stringify(filter),
  );
});
