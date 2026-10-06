import assert from "node:assert/strict";
import test from "node:test";
import { notificationHref } from "../src/components/notifications/location.js";

test("inbox navigation addresses a plugin panel and entity without treating data as a URL", () => {
  const result = notificationHref({
    id: "notice",
    source: "comments",
    panelId: "discussion",
    targetId: "a/b?&",
    collection: "articles",
    collectionDisplayName: null,
    item: "x/y?z#",
    actorName: null,
    preview: "text",
    createdAt: "2026-10-05T00:00:00Z",
    readAt: null,
  });
  const url = new URL(result, "https://example.test");
  assert.equal(url.origin, "https://example.test");
  assert.equal(url.pathname, "/items/articles/x%2Fy%3Fz%23");
  assert.equal(url.searchParams.get("panel"), "plugin:comments:discussion");
  assert.equal(url.searchParams.get("target"), "a/b?&");
});
