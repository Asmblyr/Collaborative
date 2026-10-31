import assert from "node:assert/strict";
import test from "node:test";
import {
  settingsReturnHref,
  settingsTab,
  settingsTabHref,
  settingsTabs,
} from "../src/lib/settings-location";
import {
  workspaceHref,
  workspaceSelection,
  workspaceViewQuery,
} from "../src/lib/workspace-location";
import { tableQueryDefaults } from "../src/lib/table-query-defaults";

const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const snapshot = {
  selectedId: first,
  workspaces: [
    { id: first, name: "One", description: "", collections: ["requests"] },
    { id: second, name: "Two", description: "", collections: ["departments"] },
  ],
};

test("settings tabs preserve workspace and unrelated URL state, including all direct login targets", () => {
  for (const tab of settingsTabs) {
    const target = settingsTabHref(
      `/settings?workspace=${second}&sso=linked#profile`,
      tab,
    );
    const parsed = new URL(target, "http://test.invalid");
    assert.equal(settingsTab(parsed.searchParams.get("tab")), tab);
    assert.equal(parsed.searchParams.get("workspace"), second);
    assert.equal(parsed.hash, "#profile");
    assert.equal(
      settingsReturnHref({ tab, workspace: second }),
      `/settings?tab=${tab}&workspace=${second}`,
    );
  }
  assert.equal(settingsTab("unknown"), "profile");
  assert.equal(settingsTab(["security", "appearance"]), "profile");
  assert.equal(
    settingsReturnHref({ tab: ["security"], workspace: [first, second] }),
    "/settings",
  );
});

test("explicit workspace URLs override saved preferences and keep all distinct from missing or inaccessible", () => {
  const resolve = (value: string) =>
    workspaceSelection(snapshot, new URLSearchParams(value));
  assert.deepEqual(resolve(""), { id: first, missing: false });
  assert.deepEqual(resolve(`workspace=${second}`), {
    id: second,
    missing: false,
  });
  assert.deepEqual(resolve("workspace=all"), { id: null, missing: false });
  assert.deepEqual(resolve("workspace=deleted"), { id: null, missing: true });
  assert.deepEqual(resolve(`workspace=${first}&workspace=${second}`), {
    id: null,
    missing: true,
  });
  assert.deepEqual(
    workspaceSelection(
      { ...snapshot, workspaces: [] },
      new URLSearchParams(`workspace=${first}`),
    ),
    { id: null, missing: true },
  );
  assert.equal(workspaceViewQuery(undefined), "");
  assert.equal(workspaceViewQuery(first), `?workspaceId=${first}`);
  assert.equal(workspaceViewQuery("all"), "?workspaceId=all");
});

test("workspace navigation preserves table queries, record targets, fragments and explicit destinations", () => {
  const href = `/items/requests/42?filter=&limit=50&sort=title#details`;
  const scoped = workspaceHref(href, second);
  assert.equal(
    scoped,
    `/items/requests/42?filter=&limit=50&sort=title&workspace=${second}#details`,
  );
  assert.equal(workspaceHref(scoped, first), scoped);
  assert.equal(
    workspaceHref(scoped, null, true),
    "/items/requests/42?filter=&limit=50&sort=title&workspace=all#details",
  );
  for (const external of [
    "https://example.com/path",
    "//example.com/path",
    "/\\example.com/path",
    "#details",
  ]) {
    assert.equal(workspaceHref(external, first), external);
  }
  const canonical = tableQueryDefaults(
    { workspace: second },
    {
      filter: null,
      sort: { field: "title", direction: "asc" },
      pageSize: 50,
    } as Parameters<typeof tableQueryDefaults>[1],
    null,
    "",
  ).canonical;
  assert.equal(new URLSearchParams(canonical!).get("workspace"), second);
});
