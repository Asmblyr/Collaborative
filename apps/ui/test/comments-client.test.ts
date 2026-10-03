import assert from "node:assert/strict";
import test from "node:test";
import type { RecordPanelProps } from "@asmblyr/kit/ui";
import { createCommentsClient } from "../../../packages/plugin-comments/ui/api/comments.js";

test("comments client encodes record addresses and exposes separate typed operations", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const request: RecordPanelProps["request"] = async <T>(
    path: string,
    init?: RequestInit,
  ) => {
    calls.push({ path, init });
    return { data: { id: "comment" } } as T;
  };
  const api = createCommentsClient(request, {
    collection: "articles",
    item: "key/with space",
  });
  const signal = new AbortController().signal;
  await api.list(2, signal);
  await api.create("hello");
  await api.update("a/b", "edited");
  await api.delete("a/b");
  assert.deepEqual(
    calls.map((call) => call.path),
    [
      "/articles/key%2Fwith%20space?page=2",
      "/articles/key%2Fwith%20space",
      "/articles/key%2Fwith%20space/a%2Fb",
      "/articles/key%2Fwith%20space/a%2Fb",
    ],
  );
  assert.equal(calls[0].init?.signal, signal);
  assert.equal(calls[1].init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { body: "hello" });
  assert.equal(calls[2].init?.method, "PATCH");
  assert.equal(calls[3].init?.method, "DELETE");
  assert.equal(calls[3].init?.body, undefined);
});
