import assert from "node:assert/strict";
import test from "node:test";
import { cliPublicProxy } from "../src/lib/cli-public-proxy";

test("CLI proxy forwards explicit credentials without cookies, renewal or response cookies", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(new URL(url).pathname, "/schema");
      assert.deepEqual(options.headers, {
        authorization: "Bearer asm_sc_explicit",
      });
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      return Response.json(
        { data: {} },
        {
          headers: {
            "set-cookie": "ignored=private",
            "cache-control": "public",
          },
        },
      );
    },
  );
  const response = await cliPublicProxy(
    new Request("https://app.example/api/schema", {
      headers: { cookie: "session=private", authorization: "Bearer ignored" },
    }),
    "/schema",
    "GET",
    "Bearer asm_sc_explicit",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("CLI token exchange rejects foreign origin and non-JSON without contacting Core", async (t) => {
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      calls++;
      assert.deepEqual(options.headers, { "content-type": "application/json" });
      assert.equal(options.body, '{"code":"one-use"}');
      return Response.json({ data: {} });
    },
  );
  const foreign = new Request("https://app.example/api/auth/cli/token", {
    method: "POST",
    headers: {
      host: "app.example",
      origin: "https://foreign.example",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(
    (await cliPublicProxy(foreign, "/auth/cli/token", "POST")).status,
    403,
  );
  const nonJson = new Request("https://app.example/api/auth/cli/token", {
    method: "POST",
    body: "code=one-use",
  });
  assert.equal(
    (await cliPublicProxy(nonJson, "/auth/cli/token", "POST")).status,
    415,
  );
  assert.equal(calls, 0);
  const valid = new Request("https://app.example/api/auth/cli/token", {
    method: "POST",
    headers: {
      host: "app.example",
      origin: "https://app.example",
      "content-type": "application/json",
      cookie: "private=session",
    },
    body: '{"code":"one-use"}',
  });
  assert.equal(
    (await cliPublicProxy(valid, "/auth/cli/token", "POST")).status,
    200,
  );
  assert.equal(calls, 1);
});
