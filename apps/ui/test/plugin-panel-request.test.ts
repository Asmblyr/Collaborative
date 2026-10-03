import assert from "node:assert/strict";
import test from "node:test";
import { pluginRequest } from "../src/components/plugins/request.js";

test("panel requests stay in the plugin namespace and preserve errors without retrying mutations", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "http://localhost:3000" } },
  });
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  let response = Response.json({ data: [] });
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return response;
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const request = pluginRequest("comments");
  assert.deepEqual(await request("/articles/1"), { data: [] });
  assert.equal(calls[0].url, "http://localhost:3000/api/comments/articles/1");
  assert.equal(calls[0].init?.redirect, "error");
  for (const path of [
    "https://other.invalid/",
    "//other.invalid/",
    "/../users",
    "/%2e%2e/users",
  ])
    await assert.rejects(request(path), /path|namespace/);
  assert.equal(calls.length, 1);
  response = Response.json({ message: "not allowed" }, { status: 403 });
  await assert.rejects(
    request("/articles/1", { method: "POST", body: "{}" }),
    /Нет доступа/,
  );
  assert.equal(calls.length, 2);
});
