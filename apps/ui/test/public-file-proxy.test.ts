import assert from "node:assert/strict";
import test from "node:test";
import { proxyPublicFile } from "../src/lib/public-file-proxy";

test("public file proxy forwards only an allowlisted path/query without credentials or response cookies", async (t) => {
  const id = "00000000-0000-4000-8000-000000000001";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: URL, options: RequestInit) => {
    calls++;
    assert.equal(url.pathname, `/public/files/${id}/content`);
    assert.equal(url.search, "?preview=1");
    assert.equal(options.headers, undefined);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    return new Response("bytes", {
      headers: {
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
        "set-cookie": "private=token",
        "cache-control": "public, max-age=9999",
      },
    });
  });
  const request = new Request(
    `https://app.example/api/public/files/${id}/content?preview=1&token=ignored`,
    { headers: { cookie: "private=token", authorization: "Bearer ignored" } },
  );
  const response = await proxyPublicFile(request, id);
  assert.equal(await response.text(), "bytes");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await proxyPublicFile(request, "../files")).status, 404);
  assert.equal(calls, 1);
});

test("an unavailable public upstream returns a bounded failure without credentials or caching", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("upstream is unavailable");
  });
  const response = await proxyPublicFile(
    new Request("https://app.example/api/public/file"),
    "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
