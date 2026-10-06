import assert from "node:assert/strict";
import test from "node:test";
import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";

const component = () => null;

test("plugin pages reject ambiguous or unsafe addresses", () => {
  for (const id of ["", "../users", "/access", "Home", "a?x=1", "a#b", "a/b"]) {
    assert.throws(
      () => defineUiPlugin({ pages: [{ id, title: "Page", component }] }),
      /URL-safe/,
    );
  }
  assert.throws(
    () =>
      defineUiPlugin({
        pages: [
          { id: "home", title: "First", component },
          { id: "home", title: "Second", component },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      defineUiPlugin({
        pages: [{ id: "home", title: "  ", component }],
      }),
    /title/,
  );
});

test("a package may expose pages, panels or both without cross-slot id conflicts", () => {
  const page = { id: "home", title: "Overview", component };
  assert.equal(defineUiPlugin({ pages: [page] }).pages?.[0], page);
  assert.equal(
    defineUiPlugin({ recordPanels: [page] }).recordPanels?.[0],
    page,
  );
  assert.doesNotThrow(() =>
    defineUiPlugin({ pages: [page], recordPanels: [page] }),
  );
});
